package session

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

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
