package compression

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

// Simplify reduces mesh polygon count to roughly `ratio` of the input
// (e.g. 0.5 = 50% triangles) and applies the same Draco/KTX2 settings the
// Optimizer is configured with. Used by the worker to emit lower-LOD
// artifacts alongside LOD0.
//
// gltfpack flag: `-si <ratio>` — sloppy simplification using meshopt.
// Ratio MUST be in (0, 1); values outside that range return an error.
func (o *Optimizer) Simplify(ctx context.Context, glb []byte, ratio float64) ([]byte, error) {
	if len(glb) == 0 {
		return nil, fmt.Errorf("compression: empty GLB input")
	}
	if ratio <= 0 || ratio >= 1 {
		return nil, fmt.Errorf("compression: simplify ratio must be in (0,1), got %v", ratio)
	}

	dir, err := os.MkdirTemp("", "rosneft-gltfpack-lod-")
	if err != nil {
		return nil, fmt.Errorf("compression: mktemp: %w", err)
	}
	defer os.RemoveAll(dir)

	in := filepath.Join(dir, "in.glb")
	out := filepath.Join(dir, "out.glb")
	if err := os.WriteFile(in, glb, 0o600); err != nil {
		return nil, fmt.Errorf("compression: write input: %w", err)
	}

	args := o.buildArgs(in, out)
	args = append(args, "-si", strconv.FormatFloat(ratio, 'f', -1, 64))

	cmd := exec.CommandContext(ctx, o.binPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("compression: gltfpack simplify failed: %w (output: %s)", err, output)
	}
	body, err := os.ReadFile(out)
	if err != nil {
		return nil, fmt.Errorf("compression: read output: %w", err)
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("compression: gltfpack produced empty output (stderr: %s)", output)
	}
	return body, nil
}
