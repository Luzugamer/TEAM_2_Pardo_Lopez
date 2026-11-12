package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	api "nexo-onsite-operations/internal/platform/http"
	"nexo-onsite-operations/internal/platform/postgres"
)

func TestPostgresCheckInIsIdempotentAndConcurrent(t *testing.T) {
	url := os.Getenv("ONSITE_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ONSITE_TEST_DATABASE_URL no configurada")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatal(err)
	}
	router := api.NewRouter(postgres.New(pool))
	ticket := "TEST-" + uuid.NewString()
	_, err = pool.Exec(context.Background(), `INSERT INTO onsite.ticket_projections(ticket_id,event_id,scope_id,status,expires_at,masked_holder,search_code,confirmed_at) VALUES($1,'00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','active',now()+interval '1 day','T*** Test',$1,now())`, ticket)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.idempotency_records WHERE actor_id='00000000-0000-0000-0000-000000000004'`)
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.effective_attendance WHERE ticket_id=$1`, ticket)
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.attendance_facts WHERE ticket_id=$1`, ticket)
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.ticket_projections WHERE ticket_id=$1`, ticket)
	}()
	body := []byte(fmt.Sprintf(`{"ticket_id":%q,"event_id":"event-demo","scope":"main"}`, ticket))
	key := uuid.NewString()
	first := performCheckIn(t, router, body, key)
	if first.StatusCode != 201 {
		t.Fatalf("first check-in status = %d", first.StatusCode)
	}
	second := performCheckIn(t, router, body, key)
	if second.StatusCode != 201 || second.ID != first.ID {
		t.Fatalf("idempotent retry = %#v, first = %#v", second, first)
	}
	duplicate := performCheckIn(t, router, body, uuid.NewString())
	if duplicate.StatusCode != 409 {
		t.Fatalf("duplicate status = %d", duplicate.StatusCode)
	}

	concurrentTicket := "TEST-CONCURRENT-" + uuid.NewString()
	_, err = pool.Exec(context.Background(), `INSERT INTO onsite.ticket_projections(ticket_id,event_id,scope_id,status,expires_at,masked_holder,search_code,confirmed_at) VALUES($1,'00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','active',now()+interval '1 day','T*** Concurrent',$1,now())`, concurrentTicket)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.effective_attendance WHERE ticket_id=$1`, concurrentTicket)
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.attendance_facts WHERE ticket_id=$1`, concurrentTicket)
		_, _ = pool.Exec(context.Background(), `DELETE FROM onsite.ticket_projections WHERE ticket_id=$1`, concurrentTicket)
	}()
	concurrentBody := []byte(fmt.Sprintf(`{"ticket_id":%q,"event_id":"event-demo","scope":"main"}`, concurrentTicket))
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses <- performCheckIn(t, router, concurrentBody, uuid.NewString()).StatusCode
		}()
	}
	wg.Wait()
	close(statuses)
	var created, rejected int
	for status := range statuses {
		if status == 201 {
			created++
		}
		if status == 409 {
			rejected++
		}
	}
	if created != 1 || rejected != 1 {
		t.Fatalf("concurrency statuses = created:%d rejected:%d", created, rejected)
	}
}

type checkInResult struct {
	StatusCode int
	ID         string `json:"id"`
}

func performCheckIn(t *testing.T, router *api.Router, body []byte, key string) checkInResult {
	t.Helper()
	req := httptest.NewRequest("POST", "/onsite/v1/attendance/check-ins", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", key)
	req.Header.Set("X-Mock-Role", "staff")
	response, err := router.App.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	content, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var result checkInResult
	if response.StatusCode == 201 {
		if err := json.Unmarshal(content, &result); err != nil {
			t.Fatal(err)
		}
	}
	result.StatusCode = response.StatusCode
	return result
}
