EXEC := docker compose exec -T app
EXEC_TTY := docker compose exec app

.PHONY: install up down build restart ps logs frontend backend livekit test front-build shell

install:
	bun install
	go mod download

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

restart:
	docker compose restart

ps:
	docker compose ps

logs:
	docker compose logs -f

frontend:
	bun run front:dev

backend:
	docker compose logs -f app

livekit:
	docker compose logs -f livekit

test:
	$(EXEC) go test ./... -count=1
	bun run front:typecheck
	bun --cwd frontend vitest run

front-build:
	bun run front:build

shell:
	$(EXEC_TTY) sh
