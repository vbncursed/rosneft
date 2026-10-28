package auth

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/auth/mocks"
)

// LoginTimingSuite pins the "unknown identifier costs as much as a wrong
// password" rule by counting argon2id verifications, not by timing them.
type LoginTimingSuite struct {
	suite.Suite
	svc      *Service
	us       *mocks.UserStoreMock
	ss       *mocks.SessionStoreMock
	verified []string // encoded hashes handed to verify
}

func TestLoginTimingSuite(t *testing.T) {
	suite.Run(t, new(LoginTimingSuite))
}

func (s *LoginTimingSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.us = mocks.NewUserStoreMock(mc)
	s.ss = mocks.NewSessionStoreMock(mc)
	s.verified = nil
	s.svc = New(s.us, s.ss, mocks.NewTwoFAVerifierMock(mc), mocks.NewPasskeyVerifierMock(mc), time.Hour)
	s.svc.verify = func(plain, encoded string) (bool, error) {
		s.verified = append(s.verified, encoded)
		return password.Verify(plain, encoded)
	}
}

// phcParams returns the "m=..,t=..,p=.." segment of an argon2id PHC string.
func (s *LoginTimingSuite) phcParams(phc string) string {
	parts := strings.Split(phc, "$")
	assert.Equal(s.T(), len(parts), 6, "not a PHC string: %q", phc)
	assert.Equal(s.T(), parts[1], "argon2id")
	return parts[3]
}

func (s *LoginTimingSuite) TestUnknownIdentifierRunsDummyVerify() {
	ctx := s.T().Context()
	s.ss.IsLockedMock.Return(false, nil)
	s.us.GetByIdentifierMock.Return(domain.User{}, domain.ErrUserNotFound)
	s.ss.RegisterFailMock.Expect(ctx, "ghost").Return(nil)

	token, challenge, err := s.svc.Login(ctx, "ghost", "whatever")

	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
	assert.Equal(s.T(), token+challenge, "")
	assert.Equal(s.T(), len(s.verified), 1, "verify calls")
	real, err := password.Hash("x")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.phcParams(s.verified[0]), s.phcParams(real), "dummy hash drifted from password.Hash")
	assert.Equal(s.T(), s.ss.CreateAfterCounter(), uint64(0), "session created")
	assert.Equal(s.T(), s.ss.RegisterFailAfterCounter(), uint64(1))
}

func (s *LoginTimingSuite) TestWrongPasswordVerifiesOnce() {
	hash, err := password.Hash("pw")
	assert.NilError(s.T(), err)
	s.ss.IsLockedMock.Return(false, nil)
	s.us.GetByIdentifierMock.Return(domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}, nil)
	s.ss.RegisterFailMock.Return(nil)

	_, _, err = s.svc.Login(s.T().Context(), "ivan", "WRONG")

	assert.ErrorIs(s.T(), err, domain.ErrInvalidCredential)
	assert.DeepEqual(s.T(), s.verified, []string{hash})
}

func (s *LoginTimingSuite) TestLockedDoesNotVerify() {
	s.ss.IsLockedMock.Return(true, nil)

	_, _, err := s.svc.Login(s.T().Context(), "ghost", "whatever")

	assert.ErrorIs(s.T(), err, domain.ErrLoginThrottled)
	assert.Equal(s.T(), len(s.verified), 0)
}

// Measurement, not a gate: go test -run TestLoginTimingMeasure -v ./internal/service/auth
// (skipped under -short, and it asserts nothing about time).
func TestLoginTimingMeasure(t *testing.T) {
	if testing.Short() {
		t.Skip("timing measurement")
	}
	mc := minimock.NewController(t)
	us, ss := mocks.NewUserStoreMock(mc), mocks.NewSessionStoreMock(mc)
	svc := New(us, ss, mocks.NewTwoFAVerifierMock(mc), mocks.NewPasskeyVerifierMock(mc), time.Hour)
	hash, err := password.Hash("pw")
	assert.NilError(t, err)
	ss.IsLockedMock.Return(false, nil)
	ss.RegisterFailMock.Return(nil)
	known := domain.User{ID: "u1", Status: domain.StatusActive, PasswordHash: hash}
	us.GetByIdentifierMock.Set(func(_ context.Context, id string) (domain.User, error) {
		if id == "ivan" {
			return known, nil
		}
		return domain.User{}, domain.ErrUserNotFound
	})

	const n = 15
	avg := func(id string) time.Duration {
		start := time.Now()
		for range n {
			_, _, _ = svc.Login(t.Context(), id, "WRONG")
		}
		return time.Since(start) / n
	}
	avg("ghost") // warm-up: the first call also derives the dummy hash
	t.Logf("unknown=%v wrong-password=%v", avg("ghost"), avg("ivan"))
}
