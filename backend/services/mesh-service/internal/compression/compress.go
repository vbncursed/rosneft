package compression

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Compress runs gltfpack on the input GLB and returns the optimised result.
// The input is written to a temporary file (gltfpack does not accept stdin)
// and the output is read back into memory.
//
// Flag rationale:
//   - `-cc`  — KHR_draco_mesh_compression (when WithDraco)
//   - `-tc`  — KHR_texture_basisu via Basis Universal (when WithKTX2)
//   - `-noq` — skip mesh quantization extensions; we want explicit control
//     of which extensions land, so DRACOLoader on the frontend doesn't also
//     need KHR_mesh_quantization handling
//   - `-kn -km -ke` — preserve node, material and extras names so debugging
//     and downstream texture lookups continue to work after compression
func (o *Optimizer) Compress(ctx context.Context, glb []byte) ([]byte, error) {
	if len(glb) == 0 {
		return nil, fmt.Errorf("compression: empty GLB input")
	}
	if !o.HasOptimisations() {
		return glb, nil
	}

	dir, err := os.MkdirTemp("", "rosneft-gltfpack-")
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
	cmd := exec.CommandContext(ctx, o.binPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("compression: gltfpack failed: %w (output: %s)", err, output)
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

// buildArgs returns the gltfpack argv for this Optimizer's flags.
func (o *Optimizer) buildArgs(in, out string) []string {
	args := []string{
		"-i", in,
		"-o", out,
		"-noq",
		"-kn", "-km", "-ke",
	}
	if o.draco {
		args = append(args, "-cc")
	}
	if o.ktx2 {
		args = append(args, "-tc")
	}
	return args
}
