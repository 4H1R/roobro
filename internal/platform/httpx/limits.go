package httpx

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

const (
	MaxJSONBody    = 64 << 10
	MaxWebhookBody = 1 << 20
)

type peerBudget struct {
	requests *rate.Limiter
	creates  *rate.Limiter
	lastSeen time.Time
}

// RequestLimits bounds work before decoding or authentication. Peer budgets use
// the TCP peer, never caller-supplied forwarding headers. Behind a proxy the
// budget is shared; operators can additionally limit individual clients there.
func RequestLimits() gin.HandlerFunc {
	var mu sync.Mutex
	peers := make(map[string]*peerBudget)
	global := rate.NewLimiter(1000, 2000)
	inflight := make(chan struct{}, 64)
	return func(c *gin.Context) {
		now := time.Now()
		peer, _, err := net.SplitHostPort(c.Request.RemoteAddr)
		if err != nil {
			peer = c.Request.RemoteAddr
		}
		mu.Lock()
		budget := peers[peer]
		if budget == nil {
			for key, old := range peers {
				if now.Sub(old.lastSeen) > 5*time.Minute {
					delete(peers, key)
				}
			}
			if len(peers) < 2048 {
				budget = &peerBudget{requests: rate.NewLimiter(200, 400), creates: rate.NewLimiter(rate.Every(5*time.Second), 10)}
				peers[peer] = budget
			}
		}
		allowed := budget != nil && global.AllowN(now, 1)
		if budget != nil {
			budget.lastSeen = now
			allowed = allowed && budget.requests.AllowN(now, 1)
			if c.Request.Method == http.MethodPost && c.FullPath() == "/api/v1/meetings" {
				allowed = allowed && budget.creates.AllowN(now, 1)
			}
		}
		mu.Unlock()
		if !allowed {
			c.Header("Retry-After", "5")
			Error(c, http.StatusTooManyRequests, "rate_limited", "Too many requests. Please try again shortly.")
			return
		}
		select {
		case inflight <- struct{}{}:
			defer func() { <-inflight }()
		default:
			Error(c, http.StatusServiceUnavailable, "busy", "The server is busy. Please try again shortly.")
			return
		}
		limit := int64(MaxJSONBody)
		if c.FullPath() == "/api/v1/livekit/webhook" {
			limit = MaxWebhookBody
		}
		if c.Request.ContentLength > limit {
			Error(c, http.StatusRequestEntityTooLarge, "body_too_large", "The request body is too large.")
			return
		}
		// Pre-read even unknown-length/chunked bodies so trailing data cannot be
		// ignored by a decoder after a successful mutation.
		if c.Request.Body == nil {
			c.Request.Body = http.NoBody
		}
		body := http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		data, err := io.ReadAll(body)
		_ = body.Close()
		if err != nil {
			if _, oversized := err.(*http.MaxBytesError); oversized {
				Error(c, http.StatusRequestEntityTooLarge, "body_too_large", "The request body is too large.")
			} else {
				Error(c, http.StatusBadRequest, "invalid_body", "The request body could not be read.")
			}
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(data))
		c.Next()
	}
}
