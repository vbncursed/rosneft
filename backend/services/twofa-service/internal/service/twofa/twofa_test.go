package twofa_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	pqtotp "github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/service/twofa"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/service/twofa/mocks"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

type TwoFASuite struct {
	suite.Suite
	st   *mocks.StoreMock
	rec  *mocks.RecoveryMock
	ciph *mocks.CipherMock
	lim  *mocks.RateLimiterMock
	svc  *twofa.Service
	ctx  context.Context
}

func TestTwoFASuite(t *testing.T) {
	suite.Run(t, new(TwoFASuite))
}

func (s *TwoFASuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.rec = mocks.NewRecoveryMock(mc)
	s.ciph = mocks.NewCipherMock(mc)
	s.lim = mocks.NewRateLimiterMock(mc)
	s.svc = twofa.New(s.st, s.rec, s.ciph, s.lim, "Andrey")
	s.ctx = s.T().Context()
}

// enabledCred returns a stored credential plus the current valid TOTP code for
// its (decrypted) secret. The stored secret is the opaque ciphertext []byte("ct").
func (s *TwoFASuite) enrolled() (plainSecret, currentCode string) {
	secret, _, err := totp.Generate("Andrey", "ivan")
	assert.NilError(s.T(), err)
	code, err := pqtotp.GenerateCode(secret, time.Now())
	assert.NilError(s.T(), err)
	return secret, code
}

func (s *TwoFASuite) TestVerifyTOTPSuccess() {
	secret, code := s.enrolled()
	s.lim.IsLockedMock.Expect(s.ctx, "u1").Return(false, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.lim.ClearMock.Expect(s.ctx, "u1").Return(nil)

	ok, err := s.svc.Verify(s.ctx, "u1", code)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)
}

func (s *TwoFASuite) TestVerifyLockedShortCircuits() {
	s.lim.IsLockedMock.Expect(s.ctx, "u1").Return(true, nil)

	ok, err := s.svc.Verify(s.ctx, "u1", "123456")
	assert.ErrorIs(s.T(), err, domain.Err2FALocked)
	assert.Assert(s.T(), !ok)
}

func (s *TwoFASuite) TestVerifyWrongCodeRegistersFail() {
	secret, _ := s.enrolled()
	s.lim.IsLockedMock.Expect(s.ctx, "u1").Return(false, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.rec.ListMock.Expect(s.ctx, "u1").Return(nil, nil, nil)
	s.lim.RegisterFailMock.Expect(s.ctx, "u1").Return(nil)

	ok, err := s.svc.Verify(s.ctx, "u1", "000000")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok)
}

func (s *TwoFASuite) TestVerifyRecoveryFallback() {
	secret, _ := s.enrolled()
	plain, hashes, err := totp.GenerateRecovery(3)
	assert.NilError(s.T(), err)

	s.lim.IsLockedMock.Expect(s.ctx, "u1").Return(false, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.rec.ListMock.Expect(s.ctx, "u1").Return([]string{"id0", "id1", "id2"}, hashes, nil)
	s.rec.MarkUsedMock.Expect(s.ctx, "id0").Return(nil)
	s.lim.ClearMock.Expect(s.ctx, "u1").Return(nil)

	ok, err := s.svc.Verify(s.ctx, "u1", plain[0])
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)
}

func (s *TwoFASuite) TestRegenerateRequiresValidCode() {
	secret, _ := s.enrolled()
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)

	_, err := s.svc.Regenerate(s.ctx, "u1", "000000")
	assert.ErrorIs(s.T(), err, domain.Err2FAInvalidCode)
}

func (s *TwoFASuite) TestSetupRejectsWhenAlreadyOn() {
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Enabled: true}, nil)

	_, _, err := s.svc.Setup(s.ctx, "u1", "ivan")
	assert.ErrorIs(s.T(), err, domain.Err2FAAlreadyEnabled)
}
