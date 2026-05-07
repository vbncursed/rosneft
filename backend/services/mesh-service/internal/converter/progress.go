package converter

import "context"

// ProgressFn receives coarse stage notifications from the converter as it
// works through parse → write → compress → per-LOD simplify. Stage labels
// map to the human-facing copy on the frontend (see ConversionPending).
type ProgressFn func(stage string, fraction float32)

type progressKey struct{}

// WithProgress attaches a progress reporter to ctx. ConvertLODs (and the
// helpers it calls) will invoke fn at each internal stage boundary.
// Pass nil — or skip the call entirely — to disable reporting.
func WithProgress(ctx context.Context, fn ProgressFn) context.Context {
	if fn == nil {
		return ctx
	}
	return context.WithValue(ctx, progressKey{}, fn)
}

// report safely emits a progress event when ctx carries a reporter. No-op
// when no reporter is attached, so tests and standalone Convert calls
// don't have to wire one up.
func report(ctx context.Context, stage string, fraction float32) {
	if fn, ok := ctx.Value(progressKey{}).(ProgressFn); ok {
		fn(stage, fraction)
	}
}
