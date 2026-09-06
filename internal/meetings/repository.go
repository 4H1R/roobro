package meetings

import (
	"context"
	"sync"

	"github.com/4H1R/roobro/internal/domain"
)

type MemoryRepository struct {
	mu       sync.RWMutex
	meetings map[string]*domain.Meeting
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{meetings: make(map[string]*domain.Meeting)}
}

func (r *MemoryRepository) Create(_ context.Context, meeting *domain.Meeting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	copy := *meeting
	r.meetings[meeting.Code] = &copy
	return nil
}

func (r *MemoryRepository) ByCode(_ context.Context, code string) (*domain.Meeting, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	meeting, ok := r.meetings[code]
	if !ok {
		return nil, domain.ErrMeetingNotFound
	}
	copy := *meeting
	return &copy, nil
}

func (r *MemoryRepository) ByLiveKitRoomName(_ context.Context, roomName string) (*domain.Meeting, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, meeting := range r.meetings {
		if meeting.LiveKitRoomName == roomName {
			copy := *meeting
			return &copy, nil
		}
	}
	return nil, domain.ErrMeetingNotFound
}

func (r *MemoryRepository) Update(_ context.Context, meeting *domain.Meeting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.meetings[meeting.Code]; !ok {
		return domain.ErrMeetingNotFound
	}
	copy := *meeting
	r.meetings[meeting.Code] = &copy
	return nil
}
