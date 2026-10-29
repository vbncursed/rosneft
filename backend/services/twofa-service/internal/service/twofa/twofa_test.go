package twofa_test

import (
	"context"
	"errors"
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
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.lim.ClaimStepMock.Return(true, nil)
	s.lim.ClearMock.Expect(s.ctx, "u1").Return(nil)

	ok, err := s.svc.Verify(s.ctx, "u1", code)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)
}

// A phished code replayed inside its ~90 s window: the step was already
// accepted, so the valid-looking code is a failed attempt, not a second login.
func (s *TwoFASuite) TestVerifyReplayedTOTPIsRefused() {
	secret, code := s.enrolled()
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.lim.ClaimStepMock.Return(false, nil)
	s.rec.ListMock.Expect(s.ctx, "u1").Return(nil, nil, nil)

	ok, err := s.svc.Verify(s.ctx, "u1", code)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok)
}

// Disable is a TOTP check too: a replayed code must not switch 2FA off (Set and
// DeleteAll are unstubbed, so minimock fails the test if they are reached).
func (s *TwoFASuite) TestDisableAndRegenerateRefuseAReplayedCode() {
	secret, code := s.enrolled()
	s.lim.TakeAttemptMock.Return(true, nil)
	s.st.GetMock.Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Return([]byte(secret), nil)
	s.lim.ClaimStepMock.Return(false, nil)

	assert.ErrorIs(s.T(), s.svc.Disable(s.ctx, "u1", code), domain.ErrTwoFAInvalidCode)
	_, err := s.svc.Regenerate(s.ctx, "u1", code)
	assert.ErrorIs(s.T(), err, domain.ErrTwoFAInvalidCode)
}

// The enrolment code is a TOTP like any other: it is recorded, and a replay of
// it is refused (nothing is enabled).
func (s *TwoFASuite) TestEnableRecordsTheStepAndRefusesAReplay() {
	secret, code := s.enrolled()
	s.st.GetMock.Return(domain.Credential{UserID: "u1", Secret: []byte("ct")}, nil)
	s.ciph.DecryptMock.Return([]byte(secret), nil)
	s.lim.ClaimStepMock.Return(false, nil)

	_, err := s.svc.Enable(s.ctx, "u1", code)

	assert.ErrorIs(s.T(), err, domain.ErrTwoFAInvalidCode)
}

func (s *TwoFASuite) TestVerifyLockedShortCircuits() {
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(false, nil)

	ok, err := s.svc.Verify(s.ctx, "u1", "123456")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFALocked)
	assert.Assert(s.T(), !ok)
}

func (s *TwoFASuite) TestVerifyWrongCodeRegistersFail() {
	secret, _ := s.enrolled()
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.rec.ListMock.Expect(s.ctx, "u1").Return(nil, nil, nil)

	ok, err := s.svc.Verify(s.ctx, "u1", "000000")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok)
}

func (s *TwoFASuite) TestVerifyRecoveryFallback() {
	secret, _ := s.enrolled()
	plain, hashes, err := totp.GenerateRecovery(3)
	assert.NilError(s.T(), err)

	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.rec.ListMock.Expect(s.ctx, "u1").Return([]string{"id0", "id1", "id2"}, hashes, nil)
	s.rec.ConsumeMock.Expect(s.ctx, "id0").Return(true, nil)
	s.lim.ClearMock.Expect(s.ctx, "u1").Return(nil)

	ok, err := s.svc.Verify(s.ctx, "u1", plain[0])
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)
}

// Another Verify spent the code between our List and Consume: this attempt is
// a failed one, not a second success.
func (s *TwoFASuite) TestVerifyRecoveryAlreadyConsumedFails() {
	secret, _ := s.enrolled()
	plain, hashes, err := totp.GenerateRecovery(1)
	assert.NilError(s.T(), err)

	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.rec.ListMock.Expect(s.ctx, "u1").Return([]string{"id0"}, hashes, nil)
	s.rec.ConsumeMock.Expect(s.ctx, "id0").Return(false, nil)

	ok, err := s.svc.Verify(s.ctx, "u1", plain[0])
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok)
}

func (s *TwoFASuite) TestRegenerateRequiresValidCode() {
	secret, _ := s.enrolled()
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)

	_, err := s.svc.Regenerate(s.ctx, "u1", "000000")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFAInvalidCode)
}

func (s *TwoFASuite) TestSetupRejectsWhenAlreadyOn() {
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Enabled: true}, nil)

	_, _, err := s.svc.Setup(s.ctx, "u1", "ivan")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFAAlreadyEnabled)
}

// The batch form the admin user list depends on. Ids the store does not report
// are off; nothing is invented for them here.
func (s *TwoFASuite) TestEnabledForReturnsOnlyTheEnabledIds() {
	s.st.EnabledForMock.Expect(s.ctx, []string{"a", "b"}).Return([]string{"a"}, nil)

	got, err := s.svc.EnabledFor(s.ctx, []string{"a", "b"})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []string{"a"})
}

// An empty batch must not reach the database. The gateway calls this on every
// admin list render, including one with no rows to show.
func (s *TwoFASuite) TestEnabledForSkipsTheStoreOnAnEmptyBatch() {
	got, err := s.svc.EnabledFor(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got == nil)
}

// A store failure is not "nobody has 2FA on" — it is no answer at all, and the
// caller has to be able to tell the difference.
func (s *TwoFASuite) TestEnabledForPropagatesTheStoreError() {
	s.st.EnabledForMock.Expect(s.ctx, []string{"a"}).Return(nil, errors.New("db down"))

	_, err := s.svc.EnabledFor(s.ctx, []string{"a"})

	assert.ErrorContains(s.T(), err, "db down")
}

func (s *TwoFASuite) TestStatusReportsEnrolmentAndRemainingCodes() {
	mc := minimock.NewController(s.T())
	at := time.Date(2026, 8, 12, 9, 20, 11, 0, time.UTC)
	store := mocks.NewStoreMock(mc).GetMock.Return(
		domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true, EnabledAt: at}, nil)
	recovery := mocks.NewRecoveryMock(mc).CountsMock.Return(7, 10, nil)
	svc := twofa.New(store, recovery, mocks.NewCipherMock(mc), mocks.NewRateLimiterMock(mc), "Andrey")

	got, err := svc.Status(context.Background(), "u1")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.Status{
		Enabled: true, EnabledAt: at, RecoveryRemaining: 7, RecoveryTotal: 10,
	})
}

func (s *TwoFASuite) TestStatusOfAnUnenrolledUserIsOffWithNoCodes() {
	mc := minimock.NewController(s.T())
	// Counts is deliberately not stubbed: an unenrolled user must not cost a
	// second query. minimock fails the test if an unstubbed method is called.
	store := mocks.NewStoreMock(mc).GetMock.Return(domain.Credential{}, domain.ErrNotFound)
	svc := twofa.New(store, mocks.NewRecoveryMock(mc), mocks.NewCipherMock(mc),
		mocks.NewRateLimiterMock(mc), "Andrey")

	got, err := svc.Status(context.Background(), "nobody")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.Status{})
}

func (s *TwoFASuite) TestStatusOfADisabledCredentialIsOffWithNoCodes() {
	mc := minimock.NewController(s.T())
	// Counts is deliberately not stubbed: a found-but-disabled credential must
	// not cost a second query. minimock fails the test if an unstubbed method
	// is called.
	store := mocks.NewStoreMock(mc).GetMock.Return(domain.Credential{UserID: "u1", Enabled: false}, nil)
	svc := twofa.New(store, mocks.NewRecoveryMock(mc), mocks.NewCipherMock(mc),
		mocks.NewRateLimiterMock(mc), "Andrey")

	got, err := svc.Status(context.Background(), "u1")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.Status{})
}

// Disable and Regenerate take a TOTP code, so a stolen cookie could brute-force
// it unless they share Verify's per-user lock.
func (s *TwoFASuite) TestDisableAndRegenerateRefuseALockedUser() {
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(false, nil)

	err := s.svc.Disable(s.ctx, "u1", "123456")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFALocked)
	_, err = s.svc.Regenerate(s.ctx, "u1", "123456")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFALocked)
}

func (s *TwoFASuite) TestDisableWrongCodeRegistersFail() {
	secret, _ := s.enrolled()
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)

	err := s.svc.Disable(s.ctx, "u1", "000000")
	assert.ErrorIs(s.T(), err, domain.ErrTwoFAInvalidCode)
}

func (s *TwoFASuite) TestDisableRightCodeClearsFails() {
	secret, code := s.enrolled()
	s.lim.TakeAttemptMock.Expect(s.ctx, "u1").Return(true, nil)
	s.st.GetMock.Expect(s.ctx, "u1").Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	s.ciph.DecryptMock.Expect([]byte("ct")).Return([]byte(secret), nil)
	s.lim.ClaimStepMock.Return(true, nil)
	s.lim.ClearMock.Expect(s.ctx, "u1").Return(nil)
	s.st.SetMock.Return(nil)
	s.rec.DeleteAllMock.Expect(s.ctx, "u1").Return(nil)

	assert.NilError(s.T(), s.svc.Disable(s.ctx, "u1", code))
}

// A failure that is not a wrong code (store, cipher, recovery list or consume,
// 2FA not enabled) is not a guess: Verify gives the attempt back. A wrong code
// stays counted: TestVerifyWrongCodeRegistersFail sets no Refund expectation.
func (s *TwoFASuite) TestVerifyRefundsTheAttemptOnOurOwnFailures() {
	secret, _ := s.enrolled()
	plain, hashes, err := totp.GenerateRecovery(1)
	assert.NilError(s.T(), err)
	boom := errors.New("db down")
	on := domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}
	tests := []struct {
		name  string
		code  string
		setup func(st *mocks.StoreMock, rec *mocks.RecoveryMock, ciph *mocks.CipherMock)
		want  error
	}{
		{"store fails", "000000", func(st *mocks.StoreMock, _ *mocks.RecoveryMock, _ *mocks.CipherMock) {
			st.GetMock.Return(domain.Credential{}, boom)
		}, boom},
		{"2fa not enabled", "000000", func(st *mocks.StoreMock, _ *mocks.RecoveryMock, _ *mocks.CipherMock) {
			st.GetMock.Return(domain.Credential{UserID: "u1"}, nil)
		}, domain.ErrTwoFANotEnabled},
		{"decrypt fails", "000000", func(st *mocks.StoreMock, _ *mocks.RecoveryMock, ciph *mocks.CipherMock) {
			st.GetMock.Return(on, nil)
			ciph.DecryptMock.Return(nil, boom)
		}, boom},
		{"recovery list fails", "000000", func(st *mocks.StoreMock, rec *mocks.RecoveryMock, ciph *mocks.CipherMock) {
			st.GetMock.Return(on, nil)
			ciph.DecryptMock.Return([]byte(secret), nil)
			rec.ListMock.Return(nil, nil, boom)
		}, boom},
		{
			"recovery consume fails",
			plain[0],
			func(st *mocks.StoreMock, rec *mocks.RecoveryMock, ciph *mocks.CipherMock) {
				st.GetMock.Return(on, nil)
				ciph.DecryptMock.Return([]byte(secret), nil)
				rec.ListMock.Return([]string{"id0"}, hashes, nil)
				rec.ConsumeMock.Return(false, boom)
			},
			boom,
		},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			mc := minimock.NewController(s.T())
			st, rec, ciph, lim := mocks.NewStoreMock(mc), mocks.NewRecoveryMock(mc), mocks.NewCipherMock(mc),
				mocks.NewRateLimiterMock(mc)
			lim.TakeAttemptMock.Return(true, nil)
			lim.RefundMock.Expect(s.ctx, "u1").Return(nil)
			tt.setup(st, rec, ciph)

			_, err := twofa.New(st, rec, ciph, lim, "Andrey").Verify(s.ctx, "u1", tt.code)

			assert.ErrorIs(s.T(), err, tt.want)
		})
	}
}

// Disable and Regenerate share the limiter: their non-guess failures give the
// attempt back too, a wrong code (TestDisableWrongCodeRegistersFail) does not.
func (s *TwoFASuite) TestConfirmTOTPRefundsTheAttemptOnOurOwnFailures() {
	boom := errors.New("db down")
	tests := []struct {
		name  string
		setup func(st *mocks.StoreMock, ciph *mocks.CipherMock)
		want  error
	}{
		{"store fails", func(st *mocks.StoreMock, _ *mocks.CipherMock) {
			st.GetMock.Return(domain.Credential{}, boom)
		}, boom},
		{"2fa not enabled", func(st *mocks.StoreMock, _ *mocks.CipherMock) {
			st.GetMock.Return(domain.Credential{UserID: "u1"}, nil)
		}, domain.ErrTwoFANotEnabled},
		{"decrypt fails", func(st *mocks.StoreMock, ciph *mocks.CipherMock) {
			st.GetMock.Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
			ciph.DecryptMock.Return(nil, boom)
		}, boom},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			mc := minimock.NewController(s.T())
			st, ciph, lim := mocks.NewStoreMock(mc), mocks.NewCipherMock(mc), mocks.NewRateLimiterMock(mc)
			lim.TakeAttemptMock.Return(true, nil)
			lim.RefundMock.Expect(s.ctx, "u1").Return(nil)
			tt.setup(st, ciph)

			err := twofa.New(st, mocks.NewRecoveryMock(mc), ciph, lim, "Andrey").Disable(s.ctx, "u1", "000000")

			assert.ErrorIs(s.T(), err, tt.want)
		})
	}
}
