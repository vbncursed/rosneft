package converter

import (
	"context"
	"fmt"
	"log/slog"
)

// compress applies the optional post-processor (Draco) to the freshly emitted
// GLB. When no compressor is wired, the raw bytes flow through unchanged. We
// log the size delta on success so operators can see whether Draco actually
// reduced payload size for a given asset (rare adversarial inputs can grow
// slightly after compression).
func (c *Converter) compress(ctx context.Context, glb []byte) ([]byte, error) {
	if c.compressor == nil {
		return glb, nil
	}
	orig := len(glb)
	out, err := c.compressor.Compress(ctx, glb)
	if err != nil {
		return nil, fmt.Errorf("converter: compress: %w", err)
	}
	slog.InfoContext(ctx, "converter: GLB compressed",
		slog.Int("orig_bytes", orig),
		slog.Int("compressed_bytes", len(out)),
		slog.Float64("ratio", float64(len(out))/float64(orig)),
	)
	return out, nil
}
