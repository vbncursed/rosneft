package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

// PutPending stores a single-use 2FA challenge → userID with the pending TTL.
func (s *Store) PutPending(ctx context.Context, userID string) (string, error) {
	challenge, err := secret.NewToken()
	if err != nil {
		return "", err
	}
	if err := s.rdb.Set(ctx, pendingKey(challenge), userID, s.pendingTTL).Err(); err != nil {
		return "", fmt.Errorf("session.PutPending: %w", err)
	}
	return challenge, nil
}

// TakePending atomically reads + deletes a challenge, returning its userID.
func (s *Store) TakePending(ctx context.Context, challenge string) (string, error) {
	userID, err := s.rdb.GetDel(ctx, pendingKey(challenge)).Result()
	if errors.Is(err, redis.Nil) {
		return "", domain.Err2FAInvalidCode
	}
	if err != nil {
		return "", fmt.Errorf("session.TakePending: %w", err)
	}
	return userID, nil
}
