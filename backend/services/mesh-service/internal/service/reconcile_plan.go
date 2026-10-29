package service

import (
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// targetState is what the reconcile pass knows about one catalog target when
// it decides whether to queue it: plain values, so the decision is testable
// without a catalog or a queue.
type targetState struct {
	has, hasPlain bool       // the target's LOD0 exists / carries a plain GLB copy
	last          domain.Job // latest job in the index; meaningful only when seen
	seen          bool
	replaceFailed bool      // Mesh.replaceFailed(last, seen)
	queued        int       // conversions already queued by this pass
	skewed        bool      // an earlier target showed the catalog drops plain_hash
	now           time.Time // the pass's clock, for the backfill back-off
}

// targetPlan is the decision for one target.
type targetPlan struct {
	skip     bool
	reason   string // why it is queued; meaningful only when not skipped
	backfill bool   // mark the job Job.Backfill (hides its failure from the list)
	skewed   bool   // this target shows the skew: stop the drain for the rest of the pass
}

// planTarget decides what the pass does with one target. busy reports whether
// another job is live; it is called only when the answer can matter, because
// it reads the job index.
func planTarget(t targetState, busy func() bool) targetPlan {
	if failedOnSource(t.last, t.seen) || t.settled() || t.throttled(busy) {
		return targetPlan{skip: true}
	}
	plan := targetPlan{reason: "no lod0"}
	switch {
	case t.has && t.hasPlain:
		plan.reason = "failed replace"
	case t.has:
		plan.reason = "no plain copy"
		plan.skip, plan.skewed = backfillBackoff(t.last, t.seen, t.now)
	}
	// Only the plain-copy backfill is marked (Job.Backfill hides its
	// failure). A first conversion (no LOD0) is not, nor a retry of a job
	// that neither succeeded nor was a backfill: that is a failed or
	// abandoned replace-source, converting bytes the LOD0 is not built from.
	plan.backfill = t.has && (!t.seen || t.last.Status == domain.JobStatusSucceeded || t.last.Backfill)
	return plan
}

// failedOnSource: the same bytes fail the same way, so such a target is left
// alone whatever else is missing.
func failedOnSource(last domain.Job, seen bool) bool {
	return seen && last.Status == domain.JobStatusFailed && last.FailedOnSource
}

// settled: converted, with a plain copy, and nothing to retry.
func (t targetState) settled() bool {
	return t.has && t.hasPlain && !t.replaceFailed
}

// throttled: a retry or backfill goes one per pass and only on an idle worker.
func (t targetState) throttled(busy func() bool) bool {
	return t.has && (t.queued > 0 || t.skewed || busy())
}

// backfillBackoff holds back a backfill whose latest job finished less than
// BackfillRetryAfter ago. Every conversion writes the plain copy, so one that
// just succeeded without it means the catalog drops plain_hash (an older
// image): its success signal would reconvert back to back forever. skewed then
// stops the drain for this pass; the skew costs one reconversion per tick, as
// before the drain. A fresh failure is skipped without stopping it.
func backfillBackoff(last domain.Job, seen bool, now time.Time) (skip, skewed bool) {
	if !seen || now.Sub(last.UpdatedAt) >= BackfillRetryAfter {
		return false, false
	}
	skewed = last.Status == domain.JobStatusSucceeded
	return skewed || last.Status == domain.JobStatusFailed, skewed
}
