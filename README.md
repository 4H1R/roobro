# roobro

<p align="center">
  <img src="frontend/public/logo.svg" alt="roobro" width="88" />
</p>

<p align="center">
  A Persian-first, bilingual video-meeting experience for teams that work in Persian and English.
</p>

<p align="center">
  <a href="https://roobro.ir">Website</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#api">API</a>
</p>

![roobro meeting preview](frontend/public/og.png)

## About

roobro makes it simple to create and join browser-based video meetings with a human-friendly share code. The interface is Persian and RTL by default, includes a complete English LTR experience, and keeps realtime credentials behind a Go API.

The app can also run in an interactive demo mode, so the full meeting flow remains explorable when the API or LiveKit is not configured.

## Features

- Create meetings and invite people with a short share code or link
- Preview your camera and choose microphone/camera state before joining
- Join realtime rooms powered by LiveKit
- Switch between Persian RTL and English LTR with a persisted preference
- Use in-room video, audio, screen sharing, chat, participant details, and host actions
- Keep LiveKit token generation and host authorization on the server
- Explore the product without infrastructure through the built-in demo fallback
- Use a responsive interface designed for desktop and mobile

## Tech stack

| Layer | Technology |
| --- | --- |
| Web app | React 19, TanStack Start, Vite, TypeScript |
| Styling | Tailwind CSS 4, custom responsive CSS |
| Localization | i18next, react-i18next |
| Realtime media | LiveKit |
| API | Go, Gin |
| Development | Bun, Docker Compose, Make |

## Quick start

### Prerequisites

- [Bun](https://bun.sh/)
- [Go](https://go.dev/) 1.27 or later
- [Docker](https://www.docker.com/) with Docker Compose

Install the application dependencies:

```bash
make install
```

Start the Go API and local LiveKit server:

```bash
make up
```

In a second terminal, start the frontend:

```bash
make frontend
```

Open [http://localhost:3000](http://localhost:3000). Vite proxies `/api` to the Go API on port `8080` and `/rtc` to LiveKit on port `7880`.

## Configuration

Development defaults are included in `docker-compose.yml`. For custom or deployed environments, copy the example file and replace the LiveKit credentials:

```bash
cp .env.example .env
```

| Variable | Purpose | Development default |
| --- | --- | --- |
| `APP_ENV` | Application environment | `development` |
| `PORT` | API listen port | `8080` |
| `FRONTEND_URL` | Allowed frontend origin | `http://localhost:3000` |
| `LIVEKIT_HOST` | Private LiveKit API URL | `http://localhost:7880` |
| `LIVEKIT_PUBLIC_URL` | Browser-reachable LiveKit WebSocket URL | `ws://localhost:7880` |
| `LIVEKIT_API_KEY` | LiveKit API key | `devkey` in Compose |
| `LIVEKIT_API_SECRET` | LiveKit API secret | `devsecret` in Compose |

Use a public `wss://` URL for `LIVEKIT_PUBLIC_URL` in production.

## API

The API is served under `/api/v1`:

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/meetings` | Create a meeting |
| `GET` | `/meetings/:code` | Get meeting details |
| `POST` | `/meetings/:code/join` | Join and receive a LiveKit token |
| `POST` | `/meetings/:code/end` | End a meeting as its host |

A health check is available at `GET /health`.

## Development

```bash
make test        # backend tests, frontend type-check, and frontend tests
make front-build # production frontend build
make logs        # follow all container logs
make ps          # inspect container status
make restart     # restart the stack
make down        # stop the stack
```

The current backend stores meeting metadata in memory to keep the first vertical slice small. Its repository interface is ready for a persistent implementation without changing the HTTP handlers or meeting service.
