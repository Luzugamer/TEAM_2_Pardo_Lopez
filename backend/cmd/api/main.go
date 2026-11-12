package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/jackc/pgx/v5/pgxpool"

	"nexo-backend/internal/httpapi"
	"nexo-backend/internal/platform/postgres"
)

func main() {
	addr := os.Getenv("NEXO_CORE_API_ADDR")
	if addr == "" {
		addr = ":8081"
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL es obligatorio; PostgreSQL es la persistencia oficial de Nexo")
	}
	db, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Fatalf("no se pudo configurar PostgreSQL: %v", err)
	}
	defer db.Close()
	if err := db.Ping(context.Background()); err != nil {
		log.Fatalf("no se pudo conectar a PostgreSQL: %v", err)
	}
	server := httpapi.NewServer(postgres.New(db))
	app := fiber.New(fiber.Config{AppName: "Nexo Core API", BodyLimit: 2 * 1024 * 1024, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second})
	app.All("/*", adaptor.HTTPHandler(server.Handler()))
	log.Printf("Nexo Core API escuchando en %s", addr)
	log.Fatal(app.Listen(addr))
}
