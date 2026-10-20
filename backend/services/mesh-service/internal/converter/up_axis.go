package converter

import "context"

type yUpSourceKey struct{}

// WithYUpSource marks the OBJ being converted as Y-up already (a model), so
// convertRaw keeps its axes instead of detecting the up axis and swapping.
// Like WithProgress it rides on ctx, which keeps Converter's signature intact.
func WithYUpSource(ctx context.Context) context.Context {
	return context.WithValue(ctx, yUpSourceKey{}, true)
}

// YUpSource reports whether ctx was marked by WithYUpSource.
func YUpSource(ctx context.Context) bool {
	yUp, _ := ctx.Value(yUpSourceKey{}).(bool)
	return yUp
}

// zUpSource reports whether a territory's raw bbox says its source is Z-up
// (DJI photogrammetry) and so needs the Z-up→Y-up swap. It is false only when
// the Y extent is strictly smaller than both X and Z: a flat Y-up scene
// (SketchUp) is thinnest in Y. Ties and every other shape count as Z-up.
//
// ponytail: thinnest-axis heuristic. A tall, narrow Y-up territory (Y the
// largest extent) is misread as Z-up and lands on its side; upgrade path is an
// explicit up-axis choice at upload.
func zUpSource(minV, maxV vertex) bool {
	dx, dy, dz := maxV[0]-minV[0], maxV[1]-minV[1], maxV[2]-minV[2]
	return !(dy < dx && dy < dz)
}

// swapZUpToYUp rewrites positions in place from Z-up to Y-up: (x, y, z) → (x, z, -y).
func swapZUpToYUp(positions []vertex) {
	for i, p := range positions {
		positions[i] = vertex{p[0], p[2], -p[1]}
	}
}
