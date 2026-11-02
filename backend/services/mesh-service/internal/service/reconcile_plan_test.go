package service

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

func TestPlanTarget(t *testing.T) {
	now := time.Now()
	old := now.Add(-BackfillRetryAfter)
	job := func(st domain.JobStatus, at time.Time, backfill, onSource bool) domain.Job {
		return domain.Job{Status: st, UpdatedAt: at, Backfill: backfill, FailedOnSource: onSource}
	}
	idle := func() bool { return false }
	live := func() bool { return true }
	notAsked := func() bool { t.Fatal("busy asked when it cannot matter"); return false }

	tests := []struct {
		name string
		in   targetState
		busy func() bool
		want targetPlan
	}{
		{"no lod0 is a first conversion", targetState{}, notAsked, targetPlan{reason: "no lod0"}},
		{
			"no lod0 ignores queued, skew and live jobs",
			targetState{queued: 2, skewed: true},
			notAsked,
			targetPlan{reason: "no lod0"},
		},
		{
			"input failure is left alone",
			targetState{last: job(domain.JobStatusFailed, old, false, true), seen: true},
			notAsked,
			targetPlan{skip: true},
		},
		{
			"input failure wins over a missing plain copy",
			targetState{has: true, last: job(domain.JobStatusFailed, old, true, true), seen: true},
			notAsked,
			targetPlan{skip: true},
		},
		{"fully converted is settled", targetState{has: true, hasPlain: true}, notAsked, targetPlan{skip: true}},
		{
			"failed replace on an idle worker",
			targetState{
				has: true, hasPlain: true, replaceFailed: true, seen: true,
				last: job(domain.JobStatusFailed, old, false, false),
			},
			idle,
			targetPlan{reason: "failed replace"},
		},
		{
			"failed replace waits for a live job",
			targetState{has: true, hasPlain: true, replaceFailed: true},
			live,
			targetPlan{skip: true},
		},
		{
			"failed replace waits for an earlier queue",
			targetState{has: true, hasPlain: true, replaceFailed: true, queued: 1},
			notAsked,
			targetPlan{skip: true},
		},
		{
			"failed replace waits behind a skew",
			targetState{has: true, hasPlain: true, replaceFailed: true, skewed: true},
			notAsked,
			targetPlan{skip: true},
		},
		{
			"missing plain copy, never converted since, is a backfill",
			targetState{has: true},
			idle,
			targetPlan{reason: "no plain copy", backfill: true},
		},
		{
			"missing plain copy waits for a live job",
			targetState{has: true},
			live,
			targetPlan{skip: true},
		},
		{
			"missing plain copy after an old success is a backfill",
			targetState{has: true, seen: true, last: job(domain.JobStatusSucceeded, old, false, false), now: now},
			idle,
			targetPlan{reason: "no plain copy", backfill: true},
		},
		{
			"recent success without a plain copy is a skew",
			targetState{has: true, seen: true, last: job(domain.JobStatusSucceeded, now, true, false), now: now},
			idle,
			targetPlan{skip: true, reason: "no plain copy", backfill: true, skewed: true},
		},
		{
			"recent failure backs off without a skew",
			targetState{has: true, seen: true, last: job(domain.JobStatusFailed, now, true, false), now: now},
			idle,
			targetPlan{skip: true, reason: "no plain copy", backfill: true},
		},
		{
			"old failed backfill is retried as a backfill",
			targetState{has: true, seen: true, last: job(domain.JobStatusFailed, old, true, false), now: now},
			idle,
			targetPlan{reason: "no plain copy", backfill: true},
		},
		{
			"recent running job is not a backoff and is not a backfill",
			targetState{has: true, seen: true, last: job(domain.JobStatusRunning, now, false, false), now: now},
			idle,
			targetPlan{reason: "no plain copy"},
		},
		{
			"user's old failure is retried unmarked",
			targetState{has: true, seen: true, last: job(domain.JobStatusFailed, old, false, false), now: now},
			idle,
			targetPlan{reason: "no plain copy"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, planTarget(tc.in, tc.busy), tc.want)
		})
	}
}
