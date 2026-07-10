package users_test

import (
	"strings"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

func (s *UsersSuite) TestMarkTourSeenRecordsFirstRun() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	s.st.MarkTourSeenMock.Expect(s.ctx, "u1", "viewer").Return(nil)

	assert.NilError(s.T(), s.svc.MarkTourSeen(s.ctx, "u1", "viewer"))
}

// A user who skips and then finishes must not get the tour appended twice. No
// MarkTourSeenMock is armed: minimock fails the test if the store is written.
func (s *UsersSuite) TestMarkTourSeenIsIdempotent() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", OnboardingToursSeen: []string{"viewer"}}, nil)

	assert.NilError(s.T(), s.svc.MarkTourSeen(s.ctx, "u1", "viewer"))
}

// Tours are independent: finishing the viewer tour must not mark the panorama one.
func (s *UsersSuite) TestMarkTourSeenAppendsASecondTour() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", OnboardingToursSeen: []string{"viewer"}}, nil)
	s.st.MarkTourSeenMock.Expect(s.ctx, "u1", "panorama").Return(nil)

	assert.NilError(s.T(), s.svc.MarkTourSeen(s.ctx, "u1", "panorama"))
}

// The tour id crosses a trust boundary — it is appended to an array the client
// can grow. A malformed id must never reach the store, so no mock is armed.
func (s *UsersSuite) TestMarkTourSeenRejectsAMalformedID() {
	bad := []string{"", "Viewer", "-lead", "tour id", "a<script>", strings.Repeat("a", 33)}
	for _, id := range bad {
		assert.ErrorIs(s.T(), s.svc.MarkTourSeen(s.ctx, "u1", id), domain.ErrInvalidInput, id)
	}
}

// A client that invents tour ids cannot grow the array without bound.
func (s *UsersSuite) TestMarkTourSeenStopsAtTheCap() {
	full := make([]string, 16)
	for i := range full {
		full[i] = "tour" + string(rune('a'+i))
	}
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1", OnboardingToursSeen: full}, nil)

	assert.NilError(s.T(), s.svc.MarkTourSeen(s.ctx, "u1", "seventeenth"))
}

func (s *UsersSuite) TestMarkTourSeenPropagatesLookupError() {
	s.st.GetByIDMock.Expect(s.ctx, "ghost").Return(domain.User{}, domain.ErrUserNotFound)

	assert.ErrorIs(s.T(), s.svc.MarkTourSeen(s.ctx, "ghost", "viewer"), domain.ErrUserNotFound)
}
