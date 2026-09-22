package domain

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"
)

var (
	ErrMeetingNotFound    = errors.New("meeting not found")
	ErrMeetingEnded       = errors.New("meeting has ended")
	ErrHostRequired       = errors.New("host permission required")
	ErrParticipantBanned  = errors.New("participant is banned")
	ErrChatUnauthorized   = errors.New("chat session required")
	ErrInvalidChatMessage = errors.New("invalid chat message")
	ErrInvalidParticipant = errors.New("invalid participant identity")
	ErrCapacity           = errors.New("meeting resource capacity reached")
	ErrRateLimited        = errors.New("meeting rate limit reached")
)

type MeetingStatus string

const (
	MeetingCreated MeetingStatus = "created"
	MeetingActive  MeetingStatus = "active"
	MeetingEnded   MeetingStatus = "ended"
)

type MeetingAnalytics struct {
	Truncated              bool `json:"truncated,omitempty"`
	ParticipantJoins       int  `json:"participant_joins"`
	UniqueParticipants     int  `json:"unique_participants"`
	CurrentParticipants    int  `json:"current_participants"`
	PeakParticipants       int  `json:"peak_participants"`
	CameraActivations      int  `json:"camera_activations"`
	ScreenShareActivations int  `json:"screen_share_activations"`
	MicrophoneActivations  int  `json:"microphone_activations"`
	ParticipantsRemoved    int  `json:"participants_removed"`
	ParticipantsBanned     int  `json:"participants_banned"`
}

type MeetingAnalyticsEventKind string

const (
	MeetingAnalyticsParticipantJoined    MeetingAnalyticsEventKind = "participant_joined"
	MeetingAnalyticsParticipantLeft      MeetingAnalyticsEventKind = "participant_left"
	MeetingAnalyticsCameraActivated      MeetingAnalyticsEventKind = "camera_activated"
	MeetingAnalyticsScreenShareActivated MeetingAnalyticsEventKind = "screen_share_activated"
	MeetingAnalyticsMicrophoneActivated  MeetingAnalyticsEventKind = "microphone_activated"
	MeetingAnalyticsParticipantModerated MeetingAnalyticsEventKind = "participant_moderated"
	MeetingAnalyticsRoomFinished         MeetingAnalyticsEventKind = "room_finished"
)

type MeetingAnalyticsEvent struct {
	ID                  string
	Kind                MeetingAnalyticsEventKind
	ParticipantIdentity string
	ChatSessionID       string
	TrackID             string
	Banned              bool
}

type ChatMessage struct {
	ID       int    `json:"id"`
	Identity string `json:"identity"`
	Name     string `json:"name"`
	Text     string `json:"text"`
	SentAt   int64  `json:"sentAt"`
}

type ChatState struct {
	HistoryEnabled bool          `json:"history_enabled"`
	Messages       []ChatMessage `json:"messages"`
}

type Meeting struct {
	Demo                        bool             `json:"-"`
	LastActivityAt              time.Time        `json:"-"`
	ChatHistoryEnabled          bool             `json:"chat_history_enabled"`
	ID                          string           `json:"id"`
	Code                        string           `json:"code"`
	Title                       string           `json:"title"`
	LiveKitRoomName             string           `json:"-"`
	Status                      MeetingStatus    `json:"status"`
	HostToken                   string           `json:"-"`
	CreatedAt                   time.Time        `json:"created_at"`
	StartedAt                   *time.Time       `json:"started_at,omitempty"`
	EndedAt                     *time.Time       `json:"ended_at,omitempty"`
	Analytics                   MeetingAnalytics `json:"analytics"`
	BannedParticipantIdentities []string         `json:"-"`
}

type CreateMeetingDTO struct {
	Title string `json:"title" binding:"required,min=2,max=120"`
}

type JoinMeetingDTO struct {
	Name          string `json:"name" binding:"required,min=2,max=60"`
	ParticipantID string `json:"participant_id"`
}

type ModerateParticipantDTO struct {
	Identity string `json:"-"`
	Ban      bool   `json:"ban"`
}

type CreateMeetingResponse struct {
	Meeting   *Meeting `json:"meeting"`
	HostToken string   `json:"host_token"`
}

type JoinMeetingResponse struct {
	ChatToken string    `json:"chat_token"`
	Chat      ChatState `json:"chat"`
	Meeting   *Meeting  `json:"meeting"`
	Token     string    `json:"token"`
	ServerURL string    `json:"server_url"`
	Role      string    `json:"role"`
	Identity  string    `json:"identity"`
	Demo      bool      `json:"demo"`
}

type MeetingRepository interface {
	OpenChatSession(context.Context, string, string, string, string) (ChatState, error)
	GetChat(context.Context, string, string) (ChatState, error)
	SendChat(context.Context, string, string, string, int64) (ChatMessage, error)
	SetChatHistory(context.Context, string, bool) (*Meeting, error)
	RevokeChatSessions(context.Context, string, string) error
	Create(context.Context, *Meeting) error
	ByCode(context.Context, string) (*Meeting, error)
	ByLiveKitRoomName(context.Context, string) (*Meeting, error)
	Activate(context.Context, string, time.Time) (*Meeting, error)
	BanParticipant(context.Context, string, string) (bool, error)
	Finish(context.Context, string, time.Time) error
	RecordAnalyticsEvent(context.Context, string, MeetingAnalyticsEvent) error
}

type MeetingService interface {
	GetChat(context.Context, string, string) (ChatState, error)
	SendChat(context.Context, string, string, string) (ChatMessage, error)
	SetChatHistory(context.Context, string, bool, string) (*Meeting, error)
	Create(context.Context, CreateMeetingDTO) (*CreateMeetingResponse, error)
	Get(context.Context, string) (*Meeting, error)
	Join(context.Context, string, JoinMeetingDTO, string) (*JoinMeetingResponse, error)
	ModerateParticipant(context.Context, string, ModerateParticipantDTO, string) error
	End(context.Context, string, string) (*Meeting, error)
	HandleRoomFinished(context.Context, string) error
	HandleAnalyticsEvent(context.Context, string, MeetingAnalyticsEvent) error
}

type LiveKitClient interface {
	CreateRoom(context.Context, string, uint32, uint32, uint32) error
	DeleteRoom(context.Context, string) error
	RemoveParticipant(context.Context, string, string) error
	GenerateToken(roomName, identity, name string, host bool, chatToken string) (string, error)
	PublicURL() string
	Configured() bool
}

const ChatSessionAttribute = "roobro.chat-session"

// Public correlation only, never an authorization capability. A departure can
// retire its exact chat session without trusting clocks or affecting a rejoin.
func ChatSessionID(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
