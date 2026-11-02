package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

// Create mints a token, stores the session under its idle TTL, and tracks it
// in the per-user set so it can be revoked en masse.
func (s *Store) Create(ctx context.Context, sess domain.Session) (string, error) {
	token, err := secret.NewToken()
	if err != nil {
		return "", err
	}
	if sess.AbsoluteExpiry.IsZero() {
		sess.AbsoluteExpiry = time.Now().Add(s.absoluteTTL)
	}
	payload, err := json.Marshal(sess)
	if err != nil {
		return "", fmt.Errorf("session.Create: marshal: %w", err)
	}
	pipe := s.rdb.TxPipeline()
	pipe.Set(ctx, sessionKey(token), payload, s.idleTTL)
	pipe.SAdd(ctx, userKey(sess.UserID), token)
	pipe.Expire(ctx, userKey(sess.UserID), s.absoluteTTL)
	if _, err := pipe.Exec(ctx); err != nil {
		return "", fmt.Errorf("session.Create: exec: %w", err)
	}
	return token, nil
}

// SetPasswordEpoch moves a live session to the given password epoch, keeping
// its TTL. XX: a session that was deleted meanwhile (logout) is not resurrected.
func (s *Store) SetPasswordEpoch(ctx context.Context, token string, epoch int64) error {
	sess, err := s.peek(ctx, token)
	if errors.Is(err, redis.Nil) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("session.SetPasswordEpoch: %w", err)
	}
	sess.PwEpoch = epoch
	payload, err := json.Marshal(sess)
	if err != nil {
		return fmt.Errorf("session.SetPasswordEpoch: marshal: %w", err)
	}
	err = s.rdb.SetArgs(ctx, sessionKey(token), payload, redis.SetArgs{Mode: "XX", KeepTTL: true}).Err()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("session.SetPasswordEpoch: set: %w", err)
	}
	return nil
}
