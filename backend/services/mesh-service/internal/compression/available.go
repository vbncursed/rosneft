package compression

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
)

// Available is a startup preflight: it resolves the gltfpack binary on PATH
// (or absolute path) and confirms it can execute. Worker bootstrap calls this
// once at boot and refuses to start when Draco compression is enabled but the
// binary is missing — failing fast is preferable to silently producing
// uncompressed artifacts that the frontend will load without a DRACO decoder
// configured for them.
func (o *Optimizer) Available(ctx context.Context) error {
	path, err := exec.LookPath(o.binPath)
	if err != nil {
		return fmt.Errorf("compression: gltfpack not found at %q: %w", o.binPath, err)
	}
	cmd := exec.CommandContext(ctx, path, "-h")
	if err := cmd.Run(); err != nil {
		// gltfpack exits non-zero on -h in some versions; we only treat
		// "cannot start binary" errors as fatal here.
		if _, ok := errors.AsType[*exec.Error](err); ok {
			return fmt.Errorf("compression: gltfpack at %q failed to start: %w", path, err)
		}
	}
	return nil
}
