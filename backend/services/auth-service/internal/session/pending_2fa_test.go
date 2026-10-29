package session

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/redistest"
)

func TestPendingCarriesTheEpochAndIsSingleUse(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	st := &Store{rdb: rdb, pendingTTL: 1e9}

	ch, err := st.PutPending(ctx, "u1", 1234)
	assert.NilError(t, err)
	uid, epoch, err := st.TakePending(ctx, ch)
	assert.NilError(t, err)
	assert.Equal(t, uid, "u1")
	assert.Equal(t, epoch, int64(1234))

	_, _, err = st.TakePending(ctx, ch)
	assert.ErrorIs(t, err, domain.ErrTwoFAInvalidCode)
}

// A challenge written by the previous release holds the bare user id.
func TestTakePendingAcceptsALegacyValue(t *testing.T) {
	ctx := t.Context()
	rdb, _ := redistest.Mini(t)
	st := &Store{rdb: rdb, pendingTTL: 1e9}
	assert.NilError(t, rdb.Set(ctx, pendingKey("old"), "u1", 0).Err())

	uid, epoch, err := st.TakePending(ctx, "old")
	assert.NilError(t, err)
	assert.Equal(t, uid, "u1")
	assert.Equal(t, epoch, int64(0))
}
