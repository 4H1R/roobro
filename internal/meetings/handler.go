package meetings

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/livekit/protocol/auth"
	lk "github.com/livekit/protocol/livekit"
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
	rg.Use(httpx.RequestLimits())
	rg.POST("/meetings", h.create)
	rg.GET("/meetings/:code", h.get)
	rg.POST("/meetings/:code/join", h.join)
	rg.GET("/meetings/:code/chat", h.getChat)
	rg.POST("/meetings/:code/chat", h.sendChat)
	rg.PATCH("/meetings/:code/settings", h.setChatHistory)
	rg.POST("/meetings/:code/participants/:identity/remove", h.moderateParticipant)
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

func (h *Handler) moderateParticipant(c *gin.Context) {
	var input domain.ModerateParticipantDTO
	if err := c.ShouldBindJSON(&input); err != nil {
		httpx.Error(c, http.StatusBadRequest, "validation_error", "Please provide a moderation action.")
		return
	}
	input.Identity = c.Param("identity")
	if err := h.service.ModerateParticipant(c.Request.Context(), c.Param("code"), input, c.GetHeader("X-Host-Token")); err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusOK, gin.H{"removed": true, "banned": input.Ban})
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
	} else if roomName, analyticsEvent, ok := analyticsEventFromWebhook(event); ok {
		if err := h.service.HandleAnalyticsEvent(c.Request.Context(), roomName, analyticsEvent); err != nil && !errors.Is(err, domain.ErrMeetingNotFound) {
			respondError(c, err)
			return
		}
	}
	c.Status(http.StatusNoContent)
}

func analyticsEventFromWebhook(event *lk.WebhookEvent) (string, domain.MeetingAnalyticsEvent, bool) {
	if event.Room == nil || event.Room.Name == "" {
		return "", domain.MeetingAnalyticsEvent{}, false
	}
	analyticsEvent := domain.MeetingAnalyticsEvent{ID: event.Id}
	switch event.Event {
	case webhook.EventParticipantJoined:
		if event.Participant == nil || event.Participant.Identity == "" {
			return "", domain.MeetingAnalyticsEvent{}, false
		}
		analyticsEvent.Kind = domain.MeetingAnalyticsParticipantJoined
		analyticsEvent.ParticipantIdentity = event.Participant.Identity
	case webhook.EventParticipantLeft:
		if event.Participant == nil || event.Participant.Identity == "" {
			return "", domain.MeetingAnalyticsEvent{}, false
		}
		analyticsEvent.Kind = domain.MeetingAnalyticsParticipantLeft
		analyticsEvent.ParticipantIdentity = event.Participant.Identity
		analyticsEvent.ChatSessionID = event.Participant.Attributes[domain.ChatSessionAttribute]
	case webhook.EventTrackPublished:
		if event.Track == nil {
			return "", domain.MeetingAnalyticsEvent{}, false
		}
		analyticsEvent.TrackID = event.Track.Sid
		switch event.Track.Source {
		case lk.TrackSource_CAMERA:
			analyticsEvent.Kind = domain.MeetingAnalyticsCameraActivated
		case lk.TrackSource_SCREEN_SHARE:
			analyticsEvent.Kind = domain.MeetingAnalyticsScreenShareActivated
		case lk.TrackSource_MICROPHONE:
			analyticsEvent.Kind = domain.MeetingAnalyticsMicrophoneActivated
		default:
			return "", domain.MeetingAnalyticsEvent{}, false
		}
	default:
		return "", domain.MeetingAnalyticsEvent{}, false
	}
	return event.Room.Name, analyticsEvent, true
}

func respondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, domain.ErrCapacity), errors.Is(err, domain.ErrRateLimited):
		c.Header("Retry-After", "5")
		httpx.Error(c, http.StatusTooManyRequests, "resource_limit", "The meeting service is at its limit. Please try again shortly.")
	case errors.Is(err, domain.ErrChatUnauthorized):
		httpx.Error(c, http.StatusUnauthorized, "chat_session_required", "Join the meeting to access chat.")
	case errors.Is(err, domain.ErrInvalidChatMessage):
		httpx.Error(c, http.StatusBadRequest, "invalid_chat_message", "Messages must contain 1 to 2000 characters.")
	case errors.Is(err, domain.ErrMeetingNotFound):
		httpx.Error(c, http.StatusNotFound, "meeting_not_found", "This meeting does not exist.")
	case errors.Is(err, domain.ErrMeetingEnded):
		httpx.Error(c, http.StatusGone, "meeting_ended", "This meeting has ended.")
	case errors.Is(err, domain.ErrHostRequired):
		httpx.Error(c, http.StatusForbidden, "host_required", "Only the host can do that.")
	case errors.Is(err, domain.ErrParticipantBanned):
		httpx.Error(c, http.StatusForbidden, "participant_banned", "You have been banned from this meeting.")
	case errors.Is(err, domain.ErrInvalidParticipant):
		httpx.Error(c, http.StatusBadRequest, "invalid_participant", "The participant identity is invalid.")
	default:
		httpx.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong.")
	}
}

func (h *Handler) getChat(c *gin.Context) {
	result, err := h.service.GetChat(c.Request.Context(), c.Param("code"), c.GetHeader("X-Chat-Token"))
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusOK, result)
}
func (h *Handler) sendChat(c *gin.Context) {
	var input struct {
		Text string `json:"text" binding:"required,max=2000"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		httpx.Error(c, http.StatusBadRequest, "validation_error", "Messages must contain 1 to 2000 characters.")
		return
	}
	result, err := h.service.SendChat(c.Request.Context(), c.Param("code"), c.GetHeader("X-Chat-Token"), input.Text)
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusCreated, result)
}
func (h *Handler) setChatHistory(c *gin.Context) {
	var input struct {
		Enabled *bool `json:"chat_history_enabled" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		httpx.Error(c, http.StatusBadRequest, "validation_error", "Please provide the chat history setting.")
		return
	}
	result, err := h.service.SetChatHistory(c.Request.Context(), c.Param("code"), *input.Enabled, c.GetHeader("X-Host-Token"))
	if err != nil {
		respondError(c, err)
		return
	}
	httpx.OK(c, http.StatusOK, result)
}
