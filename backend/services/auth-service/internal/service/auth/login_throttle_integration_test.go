//go:build integration

package auth_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/session"
)

// The failure budget must hold under concurrency: with maxFails=5, no more
// than 5 password checks may run no matter how many wrong guesses arrive at
// once. A check-then-increment gap lets every in-flight guess through.
func TestLoginBudgetHoldsUnderConcurrentGuesses(t *testing.T) {
	rdb := redistest.Client(t)

	const maxFails, guesses = 5, 24
	hash, err := password.Hash("pw")
	assert.NilError(t, err)
	var checks atomic.Int32
	mc := minimock.NewController(t)
	us := mocks.NewUserStoreMock(mc).GetByIdentifierMock.Set(
		func(context.Context, string) (domain.User, error) {
			checks.Add(1)
			return domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil
		})
	sessions := session.New(rdb, time.Hour, time.Hour, time.Minute, maxFails, time.Hour)
	svc := auth.New(us, sessions, mocks.NewTwoFAVerifierMock(mc), mocks.NewPasskeyVerifierMock(mc), time.Hour)

	var wg sync.WaitGroup
	start := make(chan struct{})
	for range guesses {
		wg.Go(func() {
			<-start
			_, _, _ = svc.Login(t.Context(), "ivan", "WRONG")
		})
	}
	close(start)
	wg.Wait()

	assert.Assert(t, checks.Load() <= maxFails, "%d password checks ran, budget is %d", checks.Load(), maxFails)
}
