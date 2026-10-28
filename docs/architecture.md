# Architecture and limits

## How it works

The frontend image uses Caddy to serve the Vite-built React application and
forward `/api/*` and `/health` to the Go API through one HTTP port. Deployers
provide their own public reverse proxy, domains, and HTTPS configuration.

The API creates meetings, authorizes hosts, and signs LiveKit access tokens;
browsers then connect directly to LiveKit for signaling and media. LiveKit sends
signed room-lifecycle webhooks back to the API, which keep meeting status in sync
when an empty room closes after five minutes. The Compose stacks configure the
self-hosted webhook automatically; with LiveKit Cloud, configure a signed webhook
to `https://<your-api-host>/api/v1/livekit/webhook`.

Meeting responses include backend-maintained `analytics` counters for participant
joins, unique/current/peak participants, camera, screen-share and microphone
activations, and participant removals and bans. These counters contain no
per-event timestamps or history.

## Watch and listen together

Open the music button in the room controls (or the mobile More menu). Each
participant selects or drops their own copy of the same audio/video file. One
person starts the shared session, then each person clicks Join playback. Play,
pause, seek, and ending the session apply to the group; volume stays local.
Closing the panel keeps playback running.

Use the expand button above the video (or double-click the video) to fill the
meeting area without restarting playback. Escape or the restore button returns
it to the sidebar. The participant list shows who has not picked a file, is
checking a file, has a matching or different copy, or has explicitly joined and
is ready. Buffering, blocked audio, and stale status updates are shown
separately. The ready count helps the group decide when to press Play; it does
not start or block playback automatically. Readiness is specific to each shared
session.

### Privacy and file matching

The file is never uploaded or transferred. Only its name, size, duration, a
sampled fingerprint, playback state, and participant readiness travel over
LiveKit data packets. The fingerprint checks small portions at the start,
middle, and end, so it catches common mismatches without reading a whole film
into memory; it is not a full-file integrity check. Files must be playable by
each participant's browser. Shared URLs and streaming a single participant's
file are not supported.

### Synchronization

The earliest connected participant coordinates controls, using LiveKit join
times and identity as a tie-breaker. Clients estimate clock offsets, correct
drift, and request snapshots every two seconds, including after reconnecting.
Losing the coordinator pauses the timeline until someone resumes. A stalled
participant catches up when ready rather than pausing the group. Sessions last
only for the room's connected browsers; demo mode provides local playback only.

## Storage

The backend stores meeting metadata in memory. Restarting the API clears active
meeting metadata, and multiple API replicas do not share state yet. The
repository interface is ready for a persistent implementation without changing
handlers or the meeting service.

## Resource and retention limits

Capacity and rate failures return HTTP 429; clients should retry later.

### Meetings

- The API process admits at most 100 stored meetings.
- Unused meeting links expire after one hour; ended summaries after 15 minutes.
- Ending a meeting immediately releases chat, sessions, and detailed analytics.
- Active meetings stay until the host ends them or LiveKit reports the room
  finished, and count against the limit throughout.
- API-backed demo meetings, which have no LiveKit lifecycle webhooks, expire
  after five minutes without chat/session activity.

### Chat

- Chat retains only the latest 200 messages, with monotonically increasing IDs.
  Browser chat state is also limited to 200 messages.
- The history switch exposes only that retained window; disabling history still
  excludes messages sent before a participant joined.
- Each room admits 100 chat sessions, which expire after 12 hours or five idle
  minutes.
- Signed participant departure events retire matching old sessions using a
  public, non-secret session correlation attribute. Missing or modified
  attributes fall back to idle expiry; delayed events cannot revoke a newer
  join's token.
- Rejoining the same participant identity replaces its old chat token.

### Request limits

| Limit | Value |
| --- | --- |
| Request body | 64 KiB (1 MiB for signed LiveKit webhooks), enforced before decoding or authentication, including chunked requests |
| Requests in flight | 64 |
| Global rate | 1,000/s, burst 2,000 |
| Per TCP peer | 200/s, burst 400 |
| Room joins | 10/s, burst 20 |
| Chat sends | 10/s, burst 20 |
| Meeting creation, global | 1/s, burst 10 |
| Meeting creation, per peer | 1 every 5 s, burst 10 |

Peer-budget bookkeeping is capped at 2,048 entries and idle entries expire after
five minutes. Forwarding headers cannot change peer budgets: behind the frontend
proxy all clients share its peer budget. A public proxy can additionally impose
per-client limits.

### Analytics and bans

- Analytics deduplication sets are capped at 1,024 entries each; when detail
  cannot be retained, analytics responses set `truncated: true` and totals may
  be partial.
- Ban sets accept at most 1,000 identities per meeting and reject further
  additions explicitly without forgetting existing bans.
- Anonymous identifiers remain client-supplied; banning an identity does not
  authenticate or permanently exclude a person using a new identifier.
