// Package ceremony stashes in-flight WebAuthn ceremony state in Redis, keyed by
// an opaque flow id with a short TTL.
package ceremony

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	lib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// State is what we stash between begin and finish.
type State struct {
	Session lib.SessionData `json:"session"`
	UserID  string          `json:"user_id"` // set for registration; empty for discoverable login
}

// Store persists ceremony state in Redis.
type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

// New builds a ceremony Store.
func New(rdb *redis.Client, ttl time.Duration) *Store { return &Store{rdb: rdb, ttl: ttl} }

func key(flowID string) string { return "passkey_ceremony:" + flowID }

// Put stashes state under a fresh flow id.
func (s *Store) Put(ctx context.Context, st State) (string, error) {
	buf, err := json.Marshal(st)
	if err != nil {
		return "", fmt.Errorf("ceremony.Put: marshal: %w", err)
	}
	flowID, err := newID()
	if err != nil {
		return "", err
	}
	if err := s.rdb.Set(ctx, key(flowID), buf, s.ttl).Err(); err != nil {
		return "", fmt.Errorf("ceremony.Put: %w", err)
	}
	return flowID, nil
}

// Take atomically reads + deletes the ceremony state (single-use).
func (s *Store) Take(ctx context.Context, flowID string) (State, error) {
	raw, err := s.rdb.GetDel(ctx, key(flowID)).Bytes()
	if errors.Is(err, redis.Nil) {
		return State{}, domain.ErrCeremonyExpired
	}
	if err != nil {
		return State{}, fmt.Errorf("ceremony.Take: %w", err)
	}
	var st State
	if err := json.Unmarshal(raw, &st); err != nil {
		return State{}, fmt.Errorf("ceremony.Take: unmarshal: %w", err)
	}
	return st, nil
}

func newID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("ceremony: rand: %w", err)
	}
	return hex.EncodeToString(b), nil
}
