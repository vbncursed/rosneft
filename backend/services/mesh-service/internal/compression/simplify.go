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
// (e.g. 0.5 = 50% triangles), scales texture dimensions by the same ratio,
// and applies the Draco/KTX2 settings the Optimizer is configured with. Used
// by the worker to emit lower-LOD artifacts alongside LOD0.
//
// The input MUST be an uncompressed GLB — see rawGLB in the converter package
// for why passing the compressed LOD0 makes the texture scaling a no-op.
//
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
	defer func() { _ = os.RemoveAll(dir) }()

	in := filepath.Join(dir, "in.glb")
	out := filepath.Join(dir, "out.glb")
	if err := os.WriteFile(in, glb, 0o600); err != nil {
		return nil, fmt.Errorf("compression: write input: %w", err)
	}

	cmd := exec.CommandContext(ctx, o.binPath, o.simplifyArgs(in, out, ratio)...)
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

// simplifyArgs is the argv for one LOD pass: the shared gltfpack flags plus
// simplification.
//
// `-ts` takes the SAME ratio as `-si` and is the reason lower LODs are
// smaller on the wire at all. `-si` drops triangles, which on photogrammetry
// sources is the minority of the bytes; the textures are the bulk, and
// without `-ts` every LOD ships them at full resolution. The ratio is linear
// per side, so -si 0.25 pairs with 16x fewer texture pixels.
//
// `-ts` only bites while gltfpack is encoding textures, i.e. together with
// `-tc`. With MESH_KTX2_ENABLED=false the flag is inert and LODs stay as
// heavy as they were before this pass existed. That is acceptable: KTX2 is on
// by default, and a build without it already ships deliberately larger files.
func (o *Optimizer) simplifyArgs(in, out string, ratio float64) []string {
	r := strconv.FormatFloat(ratio, 'f', -1, 64)
	return append(o.buildArgs(in, out), "-si", r, "-ts", r)
}
