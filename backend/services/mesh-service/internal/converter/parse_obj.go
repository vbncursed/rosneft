package converter

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
)

// vertex is a position in float32 (matches GLB POSITION component type FLOAT).
type vertex [3]float32

// uv is a texture coordinate (matches GLB TEXCOORD_0 component type FLOAT).
type uv [2]float32

// triangle is three vertex indices (0-based, matching GLB SCALAR UNSIGNED_INT).
type triangle [3]uint32

// parsedSource is the geometry + UV + material-grouping payload pulled from an
// OBJ file. positions and uvs are aligned by index — when hasUVs is true,
// len(uvs) == len(positions). When hasUVs is false, uvs is nil and the GLB
// writer falls back to baseColorFactor-only primitives.
//
// Indices in groups refer to the deduplicated output arrays, not the raw
// 1-based OBJ v/vt indices: each unique (v_idx, vt_idx) pair becomes one
// output vertex so glTF's single-index-buffer model is satisfied without
// duplicating vertices that appear with the same UV across faces.
//
// groups carries the per-`usemtl` triangle partition so the GLB writer can
// emit one primitive per material. mtllib captures the first `mtllib` filename
// seen in the OBJ — the converter resolves it relative to the OBJ's directory.
type parsedSource struct {
	positions []vertex
	uvs       []uv
	groups    []materialGroup
	mtllib    string
	hasUVs    bool
}

// materialGroup is the set of faces that all reference the same `usemtl`
// material. name is the material name as written in the OBJ (case-sensitive);
// "" means "the OBJ never declared usemtl before any face line" — those
// triangles get a default white material.
type materialGroup struct {
	name      string
	triangles []triangle
}

// Pre-allocation sizes chosen so a typical photogrammetry mesh (~1M verts,
// ~2M faces) avoids early slice growth.
const (
	initialPositionsCap = 1 << 20 // 1M vertices
	initialIndicesCap   = 16      // most faces are 3-4 indices; this fits N-gons up to 16
)

// parseOBJ stream-parses positions, UVs, faces, and material directives from
// an OBJ source. Normals and smoothing-group lines are silently skipped.
//
// Coordinate system: parseOBJ converts positions from Z-up (the convention from
// most CAD/photogrammetry exports) to Y-up (the glTF convention) inline.
// convertRaw instead parses raw axes (yUp) and decides afterwards: models never
// swap, territories swap unless Y is their thinnest axis (see zUpSource).
// UV V coordinate is flipped (V_glTF = 1 − V_OBJ) because OBJ has V=0 at the
// bottom of the texture image while glTF has V=0 at the top.
//
// Faces with N>3 vertices are fan-triangulated. Each face token is parsed as
// `v[/vt[/vn]]`; if any face token lacks vt, hasUVs is set to false for the
// whole mesh and primitives drop TEXCOORD_0.
//
// `usemtl X` switches the active material — subsequent faces append to the
// X-named group (created if absent). All groups share a single deduplicated
// vertex buffer.
func parseOBJ(r io.Reader) (parsedSource, error) { return parseOBJWithUp(r, false) }

// parseOBJWithUp is parseOBJ with the swap switchable: yUp keeps positions as
// written, otherwise they are swapped from Z-up.
func parseOBJWithUp(r io.Reader, yUp bool) (parsedSource, error) {
	sc := bufio.NewScanner(r)
	// Long face lines (e.g. fan with hundreds of vertices) need a generous buffer.
	sc.Buffer(make([]byte, 0, 1<<20), 1<<24)

	p := newParser()
	for sc.Scan() {
		line := bytes.TrimLeft(sc.Bytes(), " \t")
		if len(line) < 2 || line[0] == '#' {
			continue
		}
		if err := p.parseLine(line, yUp); err != nil {
			return parsedSource{}, err
		}
	}
	if err := sc.Err(); err != nil {
		return parsedSource{}, fmt.Errorf("parseOBJ: scan: %w", err)
	}
	return p.source(), nil
}

// source assembles the result; uvs are kept only when every face carried one.
func (p *parser) source() parsedSource {
	out := parsedSource{
		positions: p.outPositions,
		groups:    p.groups,
		mtllib:    p.mtllib,
		hasUVs:    p.hasUVs && len(p.objUVs) > 0,
	}
	if out.hasUVs {
		out.uvs = p.outUVs
	}
	return out
}
