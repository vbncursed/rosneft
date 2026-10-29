package session

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

// pendingSep splits "<userID>|<epoch>" in a challenge value; a user id is a
// UUID, so it never contains it.
const pendingSep = "|"

// PutPending stores a single-use 2FA challenge → userID and the password epoch
// the first login step read, with the pending TTL.
func (s *Store) PutPending(ctx context.Context, userID string, epoch int64) (string, error) {
	challenge, err := secret.NewToken()
	if err != nil {
		return "", err
	}
	val := userID + pendingSep + strconv.FormatInt(epoch, 10)
	if err := s.rdb.Set(ctx, pendingKey(challenge), val, s.pendingTTL).Err(); err != nil {
		return "", fmt.Errorf("session.PutPending: %w", err)
	}
	return challenge, nil
}

// TakePending atomically reads + deletes a challenge, returning its userID and
// the epoch recorded with it. A challenge written before epochs were recorded
// holds the bare user id and yields epoch 0 (unchecked); that format is
// accepted for pendingTTL after the deploy that introduced the epoch.
func (s *Store) TakePending(ctx context.Context, challenge string) (string, int64, error) {
	val, err := s.rdb.GetDel(ctx, pendingKey(challenge)).Result()
	if errors.Is(err, redis.Nil) {
		return "", 0, domain.ErrTwoFAInvalidCode
	}
	if err != nil {
		return "", 0, fmt.Errorf("session.TakePending: %w", err)
	}
	userID, rawEpoch, found := strings.Cut(val, pendingSep)
	if !found {
		return val, 0, nil
	}
	epoch, err := strconv.ParseInt(rawEpoch, 10, 64)
	if err != nil {
		return "", 0, fmt.Errorf("session.TakePending: epoch: %w", err)
	}
	return userID, epoch, nil
}
