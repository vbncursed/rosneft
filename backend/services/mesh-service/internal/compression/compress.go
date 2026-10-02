package compression

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

// Compress runs gltfpack on the input GLB and returns the optimised result.
// The input is written to a temporary file (gltfpack does not accept stdin)
// and the output is read back into memory.
//
// Flag rationale:
//   - `-cc`  — EXT_meshopt_compression (when WithMeshopt)
//   - `-tc`  — KHR_texture_basisu via Basis Universal (when WithKTX2)
//   - `-noq` — skip mesh quantization extensions; we want explicit control
//     of which extensions land, so drei's MeshoptDecoder on the frontend
//     doesn't also need KHR_mesh_quantization handling
//   - `-kn -km -ke` — preserve node, material and extras names so debugging
//     and downstream texture lookups continue to work after compression
//   - `-tj 1` — encode one texture at a time. gltfpack's default is a thread
//     per core, each holding a whole decoded texture: three 8192² textures
//     OOM-killed a 4-core/8 GB host. Serial is slower on multi-texture
//     scenes and bounds peak memory to the largest texture.
//   - `-tl N` — cap the longer texture side (WithKTX2's maxTextureSize),
//     scaled by textureScale so a LOD's cap shrinks with its `-ts`
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
	defer func() { _ = os.RemoveAll(dir) }()

	in := filepath.Join(dir, "in.glb")
	out := filepath.Join(dir, "out.glb")
	if err := os.WriteFile(in, glb, 0o600); err != nil {
		return nil, fmt.Errorf("compression: write input: %w", err)
	}

	args := o.buildArgs(in, out, 1)
	cmd := exec.CommandContext(ctx, o.binPath, args...) //nolint:gosec // G204: binary is MESH_GLTFPACK_BIN; arguments are fixed flags, numbers and paths inside our own MkdirTemp dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("compression: gltfpack failed: %w (output: %s)", err, output)
	}

	body, err := os.ReadFile(out) //nolint:gosec // G304: out is a fixed name inside our own MkdirTemp dir
	if err != nil {
		return nil, fmt.Errorf("compression: read output: %w", err)
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("compression: gltfpack produced empty output (stderr: %s)", output)
	}
	return body, nil
}

// buildArgs returns the gltfpack argv for this Optimizer's flags.
// textureScale is 1 for LOD0 and the LOD ratio for simplify passes.
func (o *Optimizer) buildArgs(in, out string, textureScale float64) []string {
	args := []string{
		"-i", in,
		"-o", out,
		"-noq",
		"-kn", "-km", "-ke",
	}
	if o.meshopt {
		args = append(args, "-cc")
	}
	if o.ktx2 {
		args = append(args, "-tc", "-tj", "1")
		if o.maxTextureSize > 0 {
			limit := max(1, int(float64(o.maxTextureSize)*textureScale))
			args = append(args, "-tl", strconv.Itoa(limit))
		}
	}
	return args
}
