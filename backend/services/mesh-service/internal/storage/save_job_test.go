package storage

import (
	"fmt"
	"testing"
	"time"

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
