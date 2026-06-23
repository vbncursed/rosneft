package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Delete removes one session and its set membership.
func (s *Store) Delete(ctx context.Context, token string) error {
	if sess, err := s.peek(ctx, token); err == nil {
		s.rdb.SRem(ctx, userKey(sess.UserID), token)
	}
	if err := s.rdb.Del(ctx, sessionKey(token)).Err(); err != nil {
		return fmt.Errorf("session.Delete: %w", err)
	}
	return nil
}

// DeleteUser kills every session of a user (freeze/soft-delete/role change).
func (s *Store) DeleteUser(ctx context.Context, userID string) error {
	tokens, err := s.rdb.SMembers(ctx, userKey(userID)).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("session.DeleteUser: members: %w", err)
	}
	pipe := s.rdb.TxPipeline()
	for _, t := range tokens {
		pipe.Del(ctx, sessionKey(t))
	}
	pipe.Del(ctx, userKey(userID))
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("session.DeleteUser: exec: %w", err)
	}
	return nil
}

func (s *Store) peek(ctx context.Context, token string) (domain.Session, error) {
	raw, err := s.rdb.Get(ctx, sessionKey(token)).Bytes()
	if err != nil {
		return domain.Session{}, err
	}
	var sess domain.Session
	return sess, json.Unmarshal(raw, &sess)
}
