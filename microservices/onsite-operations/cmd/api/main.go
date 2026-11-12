package main

import (
	"context"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"log"
	api "nexo-onsite-operations/internal/platform/http"
	"nexo-onsite-operations/internal/platform/postgres"
	"os"
	"time"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL es obligatorio")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err = pool.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	r := api.NewRouter(postgres.New(pool))
	addr := os.Getenv("ONSITE_ADDR")
	if addr == "" {
		addr = ":8082"
	}
	log.Printf("Onsite Operations escuchando en %s", addr)
	log.Fatal(r.App.Listen(addr, fiber.ListenConfig{EnablePrintRoutes: false}))
}
