package domain

import (
	"context"
	"errors"
	"time"
)

var (
	ErrMeetingNotFound = errors.New("meeting not found")
	ErrMeetingEnded    = errors.New("meeting has ended")
	ErrHostRequired    = errors.New("host permission required")
)

type MeetingStatus string

const (
	MeetingCreated MeetingStatus = "created"
	MeetingActive  MeetingStatus = "active"
	MeetingEnded   MeetingStatus = "ended"
)

type Meeting struct {
	ID              string        `json:"id"`
	Code            string        `json:"code"`
	Title           string        `json:"title"`
	LiveKitRoomName string        `json:"-"`
	Status          MeetingStatus `json:"status"`
	HostToken       string        `json:"-"`
	CreatedAt       time.Time     `json:"created_at"`
	StartedAt       *time.Time    `json:"started_at,omitempty"`
	EndedAt         *time.Time    `json:"ended_at,omitempty"`
}

type CreateMeetingDTO struct {
	Title string `json:"title" binding:"required,min=2,max=120"`
}

type JoinMeetingDTO struct {
	Name string `json:"name" binding:"required,min=2,max=60"`
}

type CreateMeetingResponse struct {
	Meeting   *Meeting `json:"meeting"`
	HostToken string   `json:"host_token"`
}

type JoinMeetingResponse struct {
	Meeting   *Meeting `json:"meeting"`
	Token     string   `json:"token"`
	ServerURL string   `json:"server_url"`
	Role      string   `json:"role"`
	Identity  string   `json:"identity"`
	Demo      bool     `json:"demo"`
}

type MeetingRepository interface {
	Create(context.Context, *Meeting) error
	ByCode(context.Context, string) (*Meeting, error)
	ByLiveKitRoomName(context.Context, string) (*Meeting, error)
	Update(context.Context, *Meeting) error
}

type MeetingService interface {
	Create(context.Context, CreateMeetingDTO) (*CreateMeetingResponse, error)
	Get(context.Context, string) (*Meeting, error)
	Join(context.Context, string, JoinMeetingDTO, string) (*JoinMeetingResponse, error)
	End(context.Context, string, string) (*Meeting, error)
	HandleRoomFinished(context.Context, string) error
}

type LiveKitClient interface {
	CreateRoom(context.Context, string, uint32, uint32, uint32) error
	DeleteRoom(context.Context, string) error
	GenerateToken(roomName, identity, name string, host bool) (string, error)
	PublicURL() string
	Configured() bool
}
