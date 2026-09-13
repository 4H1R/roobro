EXEC := docker compose exec -T app
EXEC_TTY := docker compose exec app
PROD := docker compose --env-file .env.prod -f docker-compose.prod.yml

.PHONY: install up down build restart ps logs frontend backend livekit test front-build shell prod prod-up prod-pull prod-deploy prod-down prod-logs prod-ps

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

prod: prod-up

prod-up:
	$(PROD) up -d --wait --wait-timeout 120

prod-pull:
	$(PROD) pull

prod-deploy: prod-pull
	$(PROD) up -d --remove-orphans --wait --wait-timeout 120

prod-down:
	$(PROD) down

prod-logs:
	$(PROD) logs -f

prod-ps:
	$(PROD) ps
