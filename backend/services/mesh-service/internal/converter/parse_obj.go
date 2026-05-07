package converter

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"strconv"
	"unsafe"
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
// Coordinate system: positions are converted from Z-up (the convention from
// most CAD/photogrammetry exports) to Y-up (the glTF convention) inline.
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
func parseOBJ(r io.Reader) (parsedSource, error) {
	sc := bufio.NewScanner(r)
	// Long face lines (e.g. fan with hundreds of vertices) need a generous buffer.
	sc.Buffer(make([]byte, 0, 1<<20), 1<<24)

	p := parser{
		objPositions: make([]vertex, 0, initialPositionsCap),
		objUVs:       make([]uv, 0, initialPositionsCap),
		indicesBuf:   make([]uint32, 0, initialIndicesCap),
		dedup:        make(map[uint64]uint32, initialPositionsCap),
		outPositions: make([]vertex, 0, initialPositionsCap),
		outUVs:       make([]uv, 0, initialPositionsCap),
		groupsByName: make(map[string]int, 8),
		hasUVs:       true,
		// currentGroup = -1 means "no group yet"; first face creates the
		// default unnamed group.
		currentGroup: -1,
	}

	for sc.Scan() {
		line := bytes.TrimLeft(sc.Bytes(), " \t")
		if len(line) < 2 || line[0] == '#' {
			continue
		}
		switch {
		case line[0] == 'v' && line[1] == ' ':
			v, err := parseVertex(line[2:])
			if err != nil {
				return parsedSource{}, fmt.Errorf("parseOBJ: vertex line %d: %w", len(p.objPositions)+1, err)
			}
			p.objPositions = append(p.objPositions, v)
		case line[0] == 'v' && line[1] == 't' && len(line) > 2 && (line[2] == ' ' || line[2] == '\t'):
			t, err := parseUV(line[3:])
			if err != nil {
				return parsedSource{}, fmt.Errorf("parseOBJ: uv line %d: %w", len(p.objUVs)+1, err)
			}
			p.objUVs = append(p.objUVs, t)
		case line[0] == 'f' && line[1] == ' ':
			if err := p.parseFace(line[2:]); err != nil {
				return parsedSource{}, fmt.Errorf("parseOBJ: face: %w", err)
			}
		case bytes.HasPrefix(line, []byte("usemtl ")) || bytes.HasPrefix(line, []byte("usemtl\t")):
			p.switchMaterial(string(bytes.TrimSpace(line[len("usemtl"):])))
		case bytes.HasPrefix(line, []byte("mtllib ")) || bytes.HasPrefix(line, []byte("mtllib\t")):
			// First mtllib wins. SketchUp exports rarely declare more than one;
			// when they do, all libs reference the same material names anyway.
			if p.mtllib == "" {
				p.mtllib = string(bytes.TrimSpace(line[len("mtllib"):]))
			}
		}
	}
	if err := sc.Err(); err != nil {
		return parsedSource{}, fmt.Errorf("parseOBJ: scan: %w", err)
	}

	out := parsedSource{
		positions: p.outPositions,
		groups:    p.groups,
		mtllib:    p.mtllib,
		hasUVs:    p.hasUVs && len(p.objUVs) > 0,
	}
	if out.hasUVs {
		out.uvs = p.outUVs
	}
	return out, nil
}

// parser holds the slices that grow during parsing. indicesBuf is reused
// across every f-line, eliminating per-face allocations. dedup maps
// (v_idx, vt_idx) pairs — packed into a single uint64 — to the corresponding
// output vertex index, so faces that reuse a (position, UV) combination
// share a single vertex.
type parser struct {
	objPositions []vertex
	objUVs       []uv

	outPositions []vertex
	outUVs       []uv

	groups       []materialGroup
	groupsByName map[string]int
	currentGroup int

	indicesBuf []uint32
	dedup      map[uint64]uint32

	mtllib string
	hasUVs bool
}

// switchMaterial activates the named material, creating a new group if it has
// not been seen yet. Re-using a name merges the new faces into the existing
// group — keeps the GLB primitive count low when an exporter alternates
// `usemtl A` / `usemtl B` repeatedly across a single logical material.
func (p *parser) switchMaterial(name string) {
	if idx, ok := p.groupsByName[name]; ok {
		p.currentGroup = idx
		return
	}
	p.groups = append(p.groups, materialGroup{
		name:      name,
		triangles: make([]triangle, 0, 64),
	})
	p.currentGroup = len(p.groups) - 1
	p.groupsByName[name] = p.currentGroup
}

// ensureGroup is the lazy initializer used the first time a face line is seen
// without a preceding usemtl — it creates an unnamed default group.
func (p *parser) ensureGroup() {
	if p.currentGroup < 0 {
		p.switchMaterial("")
	}
}

// parseFace parses "v1[/vt1[/vn1]] v2 v3 [v4 ...]" and triangulates as a fan
// directly into the active group's triangle slice. Indices are 1-based in OBJ;
// negative values count from the current vertex/uv counts.
func (p *parser) parseFace(line []byte) error {
	p.ensureGroup()
	p.indicesBuf = p.indicesBuf[:0]
	vCount := len(p.objPositions)
	vtCount := len(p.objUVs)

	for {
		line = trimLeadingSpace(line)
		if len(line) == 0 {
			break
		}
		end := 0
		for end < len(line) && line[end] != ' ' && line[end] != '\t' {
			end++
		}
		token := line[:end]
		line = line[end:]

		var vTok, vtTok []byte
		if i := bytes.IndexByte(token, '/'); i >= 0 {
			vTok = token[:i]
			rest := token[i+1:]
			if j := bytes.IndexByte(rest, '/'); j >= 0 {
				vtTok = rest[:j]
			} else {
				vtTok = rest
			}
		} else {
			vTok = token
		}

		vIdx, err := atoiBytes(vTok)
		if err != nil {
			return fmt.Errorf("face v index %q: %w", vTok, err)
		}
		if vIdx < 0 {
			vIdx = vCount + vIdx + 1
		}
		if vIdx <= 0 || vIdx > vCount {
			return fmt.Errorf("face v index %d out of range (count=%d)", vIdx, vCount)
		}

		var vtIdx int
		if len(vtTok) > 0 {
			vtIdx, err = atoiBytes(vtTok)
			if err != nil {
				return fmt.Errorf("face vt index %q: %w", vtTok, err)
			}
			if vtIdx < 0 {
				vtIdx = vtCount + vtIdx + 1
			}
			if vtIdx <= 0 || vtIdx > vtCount {
				return fmt.Errorf("face vt index %d out of range (count=%d)", vtIdx, vtCount)
			}
		} else {
			// Any face token without a UV index downgrades the whole mesh to
			// position-only — we cannot mix UV'd and unUV'd vertices in a
			// single primitive without padding.
			p.hasUVs = false
		}

		// Pack (v_idx, vt_idx) into one map key. vtIdx == 0 means "no UV".
		key := uint64(uint32(vIdx))<<32 | uint64(uint32(vtIdx))
		outIdx, exists := p.dedup[key]
		if !exists {
			outIdx = uint32(len(p.outPositions))
			p.outPositions = append(p.outPositions, p.objPositions[vIdx-1])
			if vtIdx > 0 {
				p.outUVs = append(p.outUVs, p.objUVs[vtIdx-1])
			} else {
				p.outUVs = append(p.outUVs, uv{})
			}
			p.dedup[key] = outIdx
		}
		p.indicesBuf = append(p.indicesBuf, outIdx)
	}
	if len(p.indicesBuf) < 3 {
		return fmt.Errorf("face needs >=3 indices, got %d", len(p.indicesBuf))
	}
	// Fan-triangulate directly into the active group — no intermediate buffer.
	g := &p.groups[p.currentGroup]
	pivot := p.indicesBuf[0]
	for i := 1; i < len(p.indicesBuf)-1; i++ {
		g.triangles = append(g.triangles, triangle{pivot, p.indicesBuf[i], p.indicesBuf[i+1]})
	}
	return nil
}

// parseVertex parses "x y z [w]" and returns a Y-up vertex.
func parseVertex(line []byte) (vertex, error) {
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
	return unsafe.String(unsafe.SliceData(b), len(b))
}

func trimLeadingSpace(b []byte) []byte {
	for len(b) > 0 && (b[0] == ' ' || b[0] == '\t') {
		b = b[1:]
	}
	return b
}
