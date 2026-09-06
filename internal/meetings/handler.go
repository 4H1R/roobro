package meetings

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/webhook"

	"github.com/4H1R/roobro/internal/domain"
	"github.com/4H1R/roobro/internal/platform/httpx"
)

type Handler struct {
	service            domain.MeetingService
	webhookKeyProvider auth.KeyProvider
}

func NewHandler(service domain.MeetingService, liveKitAPIKey, liveKitAPISecret string) *Handler {
	return &Handler{
		service:            service,
		webhookKeyProvider: auth.NewSimpleKeyProvider(liveKitAPIKey, liveKitAPISecret),
	}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/meetings", h.create)
	rg.GET("/meetings/:code", h.get)
	rg.POST("/meetings/:code/join", h.join)
	rg.POST("/meetings/:code/end", h.end)
	rg.POST("/livekit/webhook", h.handleLiveKitWebhook)
}

func (h *Handler) create(c *gin.Context) {
	var input domain.CreateMeetingDTO
	if err := c.ShouldBindJSON(&input); err != nil {
		httpx.Error(c, http.StatusBadRequest, "validation_error", "Please provide a meeting title.")
		return
	}
	result, err := h.service.Create(c.Request.Context(), input)
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusCreated, result)
}

func (h *Handler) get(c *gin.Context) {
	result, err := h.service.Get(c.Request.Context(), c.Param("code"))
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusOK, result)
}

func (h *Handler) join(c *gin.Context) {
	var input domain.JoinMeetingDTO
	if err := c.ShouldBindJSON(&input); err != nil {
		httpx.Error(c, http.StatusBadRequest, "validation_error", "Please provide your name.")
		return
	}
	result, err := h.service.Join(c.Request.Context(), c.Param("code"), input, c.GetHeader("X-Host-Token"))
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusOK, result)
}

func (h *Handler) end(c *gin.Context) {
	result, err := h.service.End(c.Request.Context(), c.Param("code"), c.GetHeader("X-Host-Token"))
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusOK, result)
}

func (h *Handler) handleLiveKitWebhook(c *gin.Context) {
	event, err := webhook.ReceiveWebhookEvent(c.Request, h.webhookKeyProvider)
	if err != nil {
		httpx.Error(c, http.StatusUnauthorized, "invalid_webhook", "The webhook signature is invalid.")
		return
	}
	if event.Event == webhook.EventRoomFinished && event.Room != nil {
		if err := h.service.HandleRoomFinished(c.Request.Context(), event.Room.Name); err != nil && !errors.Is(err, domain.ErrMeetingNotFound) {
			respondError(c, err)
			return
		}
	}
	c.Status(http.StatusNoContent)
}

func respondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrMeetingNotFound):
		httpx.Error(c, http.StatusNotFound, "meeting_not_found", "This meeting does not exist.")
	case errors.Is(err, domain.ErrMeetingEnded):
		httpx.Error(c, http.StatusGone, "meeting_ended", "This meeting has ended.")
	case errors.Is(err, domain.ErrHostRequired):
		httpx.Error(c, http.StatusForbidden, "host_required", "Only the host can do that.")
	default:
		httpx.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong.")
	}
}
