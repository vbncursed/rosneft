package converter

import (
	"fmt"
	"strconv"
	"unsafe"
)

// parseVertex parses "x y z [w]" and returns a Y-up vertex; yUp says the
// source is Y-up already, so the axes are kept.
func parseVertex(line []byte, yUp bool) (vertex, error) {
	x, line, err := nextFloat32(line)
	if err != nil {
		return vertex{}, err
	}
	y, line, err := nextFloat32(line)
	if err != nil {
		return vertex{}, err
	}
	z, _, err := nextFloat32(line)
	if err != nil {
		return vertex{}, err
	}
	if yUp {
		return vertex{x, y, z}, nil
	}
	// Z-up → Y-up: (x, y, z) → (x, z, -y).
	return vertex{x, z, -y}, nil
}

// parseUV parses "u v [w]" and returns a glTF-convention UV (V flipped).
func parseUV(line []byte) (uv, error) {
	u, line, err := nextFloat32(line)
	if err != nil {
		return uv{}, err
	}
	v, _, err := nextFloat32(line)
	if err != nil {
		return uv{}, err
	}
	// OBJ V is bottom-up; glTF V is top-down.
	return uv{u, 1.0 - v}, nil
}

func nextFloat32(line []byte) (float32, []byte, error) {
	line = trimLeadingSpace(line)
	end := 0
	for end < len(line) && line[end] != ' ' && line[end] != '\t' {
		end++
	}
	if end == 0 {
		return 0, line, fmt.Errorf("expected float, got %q", line)
	}
	f, err := strconv.ParseFloat(bytesAsString(line[:end]), 32)
	if err != nil {
		return 0, line, fmt.Errorf("ParseFloat %q: %w", line[:end], err)
	}
	return float32(f), line[end:], nil
}

// atoiBytes wraps strconv.Atoi without the []byte→string copy that
// `strconv.Atoi(string(b))` would force.
func atoiBytes(b []byte) (int, error) {
	if len(b) == 0 {
		return 0, fmt.Errorf("empty token")
	}
	return strconv.Atoi(bytesAsString(b))
}

// bytesAsString returns a string that aliases the underlying bytes of b.
//
// Safety: the returned string MUST NOT outlive the bytes' lifetime — strconv
// readers don't retain the string after returning, so we're safe inside
// nextFloat32 / atoiBytes scopes.
func bytesAsString(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	//nolint:gosec // G103: the string aliases b only for the strconv call that consumes it and is never retained (see the doc comment)
	return unsafe.String(unsafe.SliceData(b), len(b))
}

func trimLeadingSpace(b []byte) []byte {
	for len(b) > 0 && (b[0] == ' ' || b[0] == '\t') {
		b = b[1:]
	}
	return b
}
