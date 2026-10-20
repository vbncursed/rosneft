package converter

import "context"

type yUpSourceKey struct{}

// WithYUpSource marks the OBJ being converted as Y-up already (a model), so
// the parser keeps its axes instead of applying the territory Z-up→Y-up swap.
// Like WithProgress it rides on ctx, which keeps Converter's signature intact.
func WithYUpSource(ctx context.Context) context.Context {
	return context.WithValue(ctx, yUpSourceKey{}, true)
}

// YUpSource reports whether ctx was marked by WithYUpSource.
func YUpSource(ctx context.Context) bool {
	yUp, _ := ctx.Value(yUpSourceKey{}).(bool)
	return yUp
}
