package storage

import (
	"fmt"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// asHash is what Redis hands back for HGETALL: every value a string.
func asHash(fields map[string]any) map[string]string {
	out := make(map[string]string, len(fields))
	for k, v := range fields {
		out[k] = fmt.Sprint(v)
	}
	return out
}

func TestJobRoundTripKeepsFailedOnSource(t *testing.T) {
	for _, onSource := range []bool{true, false} {
		in := domain.Job{
			ID: "j", Kind: domain.KindModel, Slug: "s", Status: domain.JobStatusFailed,
			ErrorMessage: "bad source: no .obj", FailedOnSource: onSource,
			CreatedAt: time.Unix(1, 0).UTC(), UpdatedAt: time.Unix(2, 0).UTC(),
		}

		got := jobFromHash(asHash(jobFields(in)))

		assert.DeepEqual(t, got, in)
	}
}

// A job saved before the field existed has no such key and is retried.
func TestJobWithoutFailedOnSourceFieldReadsFalse(t *testing.T) {
	fields := asHash(jobFields(domain.Job{ID: "old", Status: domain.JobStatusFailed}))
	delete(fields, "failed_on_source")

	assert.Assert(t, !jobFromHash(fields).FailedOnSource)
}

func TestJobRoundTripKeepsBackfill(t *testing.T) {
	in := domain.Job{
		ID: "j", Kind: domain.KindTerritory, Slug: "s", Status: domain.JobStatusFailed, Backfill: true,
		CreatedAt: time.Unix(1, 0).UTC(), UpdatedAt: time.Unix(2, 0).UTC(),
	}

	assert.DeepEqual(t, jobFromHash(asHash(jobFields(in))), in)
}

// A job saved by the previous release has no backfill key: a user-triggered
// conversion, so a failure of it stays visible.
func TestJobWithoutBackfillFieldReadsFalse(t *testing.T) {
	fields := asHash(jobFields(domain.Job{ID: "old", Status: domain.JobStatusFailed, Backfill: true}))
	delete(fields, "backfill")

	assert.Assert(t, !jobFromHash(fields).Backfill)
}

// The mark is written when the job is created and never again: a worker's or
// a progress tick's save carries a copy read before a user's submit may have
// cleared it (ClearBackfill), and must not write it back.
func TestSaveFieldsWriteBackfillOnlyOnCreate(t *testing.T) {
	now := time.Unix(5, 0).UTC()
	created := saveFields(domain.Job{ID: "j", Backfill: true}, now)
	later := saveFields(domain.Job{ID: "j", Backfill: true, CreatedAt: now}, now)

	assert.Equal(t, created["backfill"], "true")
	assert.Equal(t, created["created_at"], now.Format(time.RFC3339Nano))
	_, ok := later["backfill"]
	assert.Assert(t, !ok)
}

// A late save from a superseded job re-points the index at it. Whatever job the
// index points at must carry no expiry, or the target's latest job would vanish
// 30 days later: A running, B submitted, a late save of A, then B finishes.
func TestSaveJobKeepsTheIndexedJobPermanentAfterALateSupersededSave(t *testing.T) {
	ctx := t.Context()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	r, err := New(ctx, client)
	assert.NilError(t, err)
	save := func(id string, st domain.JobStatus) {
		assert.NilError(t, r.SaveJob(ctx, domain.Job{ID: id, Kind: domain.KindModel, Slug: "m", Status: st}))
	}

	save("A", domain.JobStatusRunning)
	save("B", domain.JobStatusPending)
	save("A", domain.JobStatusRunning) // late: index now points at A again
	assert.Equal(t, mr.TTL(jobKey("A")), time.Duration(0), "the indexed job must not expire")
	assert.Assert(t, mr.TTL(jobKey("B")) > 0, "the replaced job starts its retention clock")
	save("B", domain.JobStatusSucceeded)

	assert.Equal(t, mr.TTL(jobKey("B")), time.Duration(0), "the latest job never expires")
	assert.Assert(t, mr.TTL(jobKey("A")) > 0)
}
