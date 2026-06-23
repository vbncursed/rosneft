package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Get loads a session, refreshing the idle TTL up to the absolute cap.
func (s *Store) Get(ctx context.Context, token string) (domain.Session, error) {
	raw, err := s.rdb.Get(ctx, sessionKey(token)).Bytes()
	if errors.Is(err, redis.Nil) {
		return domain.Session{}, domain.ErrSessionInvalid
	}
	if err != nil {
		return domain.Session{}, fmt.Errorf("session.Get: %w", err)
	}
	var sess domain.Session
	if err := json.Unmarshal(raw, &sess); err != nil {
		return domain.Session{}, fmt.Errorf("session.Get: unmarshal: %w", err)
	}
	remaining := time.Until(sess.AbsoluteExpiry)
	if remaining <= 0 {
		_ = s.Delete(ctx, token)
		return domain.Session{}, domain.ErrSessionInvalid
	}
	// Slide the idle window, never past the absolute expiry.
	ttl := min(s.idleTTL, remaining)
	s.rdb.Expire(ctx, sessionKey(token), ttl)
	return sess, nil
}
