package users

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Epochs only grow, even when the clock steps back or the row carries a stamp
// from the future.
func TestNextChangeTimeIsStrictlyAfterTheCurrentEpoch(t *testing.T) {
	now := time.Date(2026, 10, 29, 12, 0, 0, 123456789, time.UTC)
	future := now.Add(time.Hour)
	tests := []struct {
		name string
		user domain.User
		want int64
	}{
		{"never changed", domain.User{}, now.Truncate(time.Microsecond).UnixMicro()},
		{
			"changed in the past",
			domain.User{PasswordChangedAt: new(now.Add(-time.Hour))},
			now.Truncate(time.Microsecond).UnixMicro(),
		},
		{"stamp in the future", domain.User{PasswordChangedAt: &future}, future.UnixMicro() + 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nextChangeTime(tt.user, now)
			assert.Equal(t, got.UnixMicro(), tt.want)
			assert.Assert(t, got.UnixMicro() > tt.user.PasswordEpoch())
		})
	}
}
