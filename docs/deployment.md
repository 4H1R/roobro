# Deploying Roobro

Roobro runs as three containers from public GitHub Container Registry images:

| Container | Role |
| --- | --- |
| `frontend` | Caddy serving the React app and forwarding `/api/*` and `/health` to the API |
| `api` | Go API that creates meetings and signs LiveKit tokens (private network only) |
| `livekit` | Signaling and WebRTC media server |

The server needs Docker, not the source tree, Bun, Go, or registry credentials.
You own the public reverse proxy, domains, and TLS. Point your proxy at the
single application HTTP port; no path routing is needed.

Deployment has two stages:

1. [Install](#install) an HTTP deployment on the server's IP to check that the
   stack works.
2. [Attach a domain and TLS](#attach-a-domain-and-tls). Browsers only allow
   camera and microphone access over HTTPS, so real meetings need this step.

## Requirements

- Publicly reachable Linux AMD64 or ARM64 host
- Docker Engine and Docker Compose v2 (with `docker compose up --wait`)
- `curl`, `od`, and `tr`
- A public IPv4 address, or NAT/port forwarding to the host
- Outbound HTTPS to GitHub, GHCR, Docker Hub, and `api.ipify.org`

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/4H1R/roobro/main/deploy/install.sh | sudo sh
```

This runs the current `main` installer as root. To inspect it first:

```bash
curl -fsSLo /tmp/roobro-install.sh https://raw.githubusercontent.com/4H1R/roobro/main/deploy/install.sh
less /tmp/roobro-install.sh
sudo sh /tmp/roobro-install.sh
```

The installer:

1. Downloads the production Compose file and an example host Caddyfile into
   `/opt/roobro`.
2. Detects the server's public IPv4 address.
3. Generates LiveKit credentials into `/opt/roobro/.env.prod` (mode `0600`).
4. Pulls and starts the containers, then waits for health checks to pass.

Rerunning it keeps the existing `.env.prod` and credentials.

### Installer options

Pass options through `sudo env` so they reach the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/4H1R/roobro/main/deploy/install.sh | sudo env ROOBRO_PUBLIC_HOST=203.0.113.10 sh
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ROOBRO_INSTALL_DIR` | `/opt/roobro` | Install directory |
| `ROOBRO_REF` | `main` | Commit or tag to download deployment files from (not the image version) |
| `ROOBRO_PUBLIC_HOST`\* | detected IPv4 | Address used in browser-facing URLs |
| `ROOBRO_APP_PORT`\* | `80` | Public application HTTP port |
| `ROOBRO_LIVEKIT_SIGNAL_PORT`\* | `7880` | Public LiveKit signaling port |
| `ROOBRO_LIVEKIT_TCP_PORT`\* | `7881` | Public WebRTC TCP port |
| `ROOBRO_LIVEKIT_UDP_PORT`\* | `7882` | Public WebRTC UDP port |

\* Only used when `.env.prod` is first created.

To pin both the installer and its files to a commit or release tag:

```bash
ref=<ref>; curl -fsSL "https://raw.githubusercontent.com/4H1R/roobro/${ref}/deploy/install.sh" | sudo env ROOBRO_REF="$ref" sh
```

### Open the firewall

Allow these inbound ports in the host firewall and any cloud security group:

| Port | Purpose |
| --- | --- |
| `80/tcp` | Frontend and API |
| `7880/tcp` | LiveKit signaling |
| `7881/tcp` | WebRTC TCP fallback |
| `7882/udp` | WebRTC media |

### Verify

```bash
cd /opt/roobro
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml ps
curl -fsS http://SERVER_IP/health
```

`frontend` and `api` should be `healthy`, `livekit` `running` or `healthy`, and
the health check should return `"status":"ok"`. The page loads at
`http://SERVER_IP`, but camera and microphone stay blocked until HTTPS is set up.

## Attach a domain and TLS

Point two hostnames at the server, one for the app and one for LiveKit. The
steps below use Caddy on the host with the Caddyfile the installer downloaded.
Don't start host Caddy while the HTTP deployment still holds port 80.

1. Edit `/opt/roobro/.env.prod` to use your hostnames and move the app and
   signaling ports to loopback:

   ```dotenv
   FRONTEND_URL=https://meet.example.com
   LIVEKIT_PUBLIC_URL=wss://livekit.example.com
   APP_BIND_ADDRESS=127.0.0.1
   APP_PORT=8081
   LIVEKIT_SIGNAL_BIND_ADDRESS=127.0.0.1
   LIVEKIT_SIGNAL_PORT=7880
   ```

2. Recreate the containers:

   ```bash
   cd /opt/roobro
   sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --remove-orphans --wait --wait-timeout 120
   ```

3. Replace the example hostnames in `deploy/Caddyfile`, then validate and install
   it. If the server already hosts other sites, merge the site blocks into your
   existing Caddyfile instead.

   ```bash
   sudoedit /opt/roobro/deploy/Caddyfile
   sudo caddy validate --config /opt/roobro/deploy/Caddyfile
   sudo install -m 0644 /opt/roobro/deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl enable --now caddy
   sudo systemctl reload caddy
   ```

4. Check the health endpoint over TLS, then create and join a real meeting:

   ```bash
   curl -fsS https://meet.example.com/health
   ```

5. Update the firewall: allow `80/tcp`, `443/tcp`, `7881/tcp`, and `7882/udp`,
   and close `7880/tcp`, since Caddy now proxies signaling.

## Update and roll back

Rerun the installer to refresh deployment files, pull images, and wait for
healthy services. Your `.env.prod` is kept. Check `.env.prod.example` for any
newly required variables.

```bash
curl -fsSL https://raw.githubusercontent.com/4H1R/roobro/main/deploy/install.sh | sudo sh
```

To roll back the frontend and API, set `IMAGE_TAG` in `.env.prod` to a known
short commit SHA and redeploy:

```bash
cd /opt/roobro
sudoedit .env.prod
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml pull
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --remove-orphans --wait --wait-timeout 120
```

Caddy ships inside the frontend image, so it follows frontend releases. LiveKit
changes only when you change `LIVEKIT_IMAGE`.

### Migrating from the separate gateway

Older releases ran a separate Caddy gateway container. Pull a frontend image
that includes API routing before applying the new Compose file, and keep
`APP_BIND_ADDRESS` and `APP_PORT` unchanged: the frontend now publishes that
same port, so your external proxy needs no changes. `up --remove-orphans`
removes the old gateway, with a brief HTTP interruption. `deploy/Caddyfile.internal`
and `CADDY_IMAGE` are no longer used.

To roll back to a pre-migration release, restore its Compose file and
`deploy/Caddyfile.internal` along with its images. An older frontend image alone
cannot forward API requests.

## Manual deployment

From a repository checkout:

```bash
cp .env.prod.example .env.prod
$EDITOR .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.prod -f docker-compose.prod.yml pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --remove-orphans --wait --wait-timeout 120
```

`config --quiet` fails early if a required value is still blank. Never commit
the completed `.env.prod`.

## Configuration

A complete `.env.prod` for a domain/TLS deployment:

```dotenv
REGISTRY=ghcr.io/4h1r
IMAGE_TAG=latest

FRONTEND_URL=https://meet.example.com
LIVEKIT_PUBLIC_URL=wss://livekit.example.com
LIVEKIT_API_KEY=lk_REPLACE_ME
LIVEKIT_API_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET

APP_BIND_ADDRESS=127.0.0.1
APP_PORT=8081
LIVEKIT_SIGNAL_BIND_ADDRESS=127.0.0.1
LIVEKIT_SIGNAL_PORT=7880
LIVEKIT_TCP_PORT=7881
LIVEKIT_UDP_PORT=7882
```

To generate credentials yourself, use `openssl rand -hex 8` for the key suffix
and `openssl rand -hex 32` for the secret.

### Required

Compose refuses to start if any of these are empty.

| Variable | Purpose |
| --- | --- |
| `FRONTEND_URL` | Exact browser origin allowed by CORS, without a trailing slash |
| `LIVEKIT_PUBLIC_URL` | Browser-reachable LiveKit URL (`wss://` in production) |
| `LIVEKIT_API_KEY` | Key shared by the API and LiveKit |
| `LIVEKIT_API_SECRET` | Signing secret shared by the API and LiveKit; keep it private and stable |

### Images

| Variable | Default | Purpose |
| --- | --- | --- |
| `REGISTRY` | `ghcr.io/4h1r` | Namespace containing `roobro-backend` and `roobro-frontend` |
| `IMAGE_TAG` | `latest` | Frontend and API version; use a short commit SHA to pin |
| `LIVEKIT_IMAGE` | `livekit/livekit-server:v1.13.6` | Tested LiveKit image; override only to upgrade intentionally |

### Ports

| Variable | Default | Installer (HTTP) | Purpose |
| --- | --- | --- | --- |
| `APP_BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` | Address for the app's HTTP port |
| `APP_PORT` | `8081` | `80` | App HTTP port |
| `LIVEKIT_SIGNAL_BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` | Address for LiveKit signaling |
| `LIVEKIT_SIGNAL_PORT` | `7880` | `7880` | Signaling port; keep `7880` with the supplied Caddyfile |
| `LIVEKIT_TCP_PORT` | `7881` | `7881` | Public WebRTC TCP port |
| `LIVEKIT_UDP_PORT` | `7882` | `7882` | Public WebRTC UDP port |

Media ports are used for both sides of the Docker mapping and as LiveKit's
advertised port, so update the firewall whenever you change one. `APP_ENV`, the
API port, and `LIVEKIT_HOST` are fixed by the internal container network.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Container unhealthy | `sudo docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=200 SERVICE` |
| Port already allocated | Find the listener with `sudo ss -lntup`, then stop it or change the port |
| Page loads but no media | Trusted HTTPS, exact `LIVEKIT_PUBLIC_URL`, public `7881/tcp` and `7882/udp`, cloud security groups, NAT rules, and `livekit` logs |
| Images won't pull | Outbound HTTPS to `ghcr.io`, and both Roobro packages are still public |
| Caddy can't bind port 80 | Containers were recreated with `APP_BIND_ADDRESS=127.0.0.1` and `APP_PORT=8081` |

Meetings are stored in memory, so run a single node and expect a restart to
clear active meetings. See [architecture and limits](architecture.md).

## Maintainers

### roobro.ir production

The production server runs a Git checkout at `/opt/roobro` and deploys with:

```bash
cd /opt/roobro
docker compose --env-file .env.prod -f docker-compose.prod.yml pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --remove-orphans --wait --wait-timeout 180
```

Its `.env.prod` holds generated LiveKit credentials and:

```dotenv
COMPOSE_PROJECT_NAME=roobro
FRONTEND_URL=https://roobro.ir
LIVEKIT_PUBLIC_URL=wss://livekit.roobro.ir
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=8091
LIVEKIT_SIGNAL_BIND_ADDRESS=127.0.0.1
LIVEKIT_SIGNAL_PORT=7890
LIVEKIT_TCP_PORT=7891
LIVEKIT_UDP_PORT=7892
```

The host Caddyfile imports `/opt/roobro/deploy/Caddyfile.roobro`, and UFW allows
`7891/tcp` and `7892/udp`. DNS for `roobro.ir`:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `212.23.201.250` |
| A | `livekit` | `212.23.201.250` |

Use DNS-only records (no provider HTTP proxying) and remove conflicting AAAA
records unless IPv6 is configured. Caddy issues certificates once both names
resolve.

### CI publishing

The GitHub Actions workflow needs no custom secrets or variables. It uses the
built-in `GITHUB_TOKEN` with `packages: write` to publish public AMD64/ARM64
images tagged `latest` and the short commit SHA. A manual dispatch can add one
extra release tag.
