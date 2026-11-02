package converter

import (
	"bytes"
	"fmt"
)

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

// newParser pre-sizes the buffers for a typical photogrammetry mesh.
func newParser() *parser {
	return &parser{
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
}

// parseLine dispatches one trimmed, non-comment line (at least two bytes) on
// its first byte; unknown directives (vn, g, o, s, ...) are skipped.
func (p *parser) parseLine(line []byte, yUp bool) error {
	switch line[0] {
	case 'v':
		return p.parseGeometryLine(line, yUp)
	case 'f':
		if isBlank(line[1]) {
			if err := p.parseFace(line[2:]); err != nil {
				return fmt.Errorf("parseOBJ: face: %w", err)
			}
		}
	case 'u', 'm':
		p.parseMaterialLine(line)
	}
	return nil
}

// parseGeometryLine handles "v x y z" and "vt u v"; vn and the rest are skipped.
func (p *parser) parseGeometryLine(line []byte, yUp bool) error {
	switch {
	case isBlank(line[1]):
		v, err := parseVertex(line[2:], yUp)
		if err != nil {
			return fmt.Errorf("parseOBJ: vertex line %d: %w", len(p.objPositions)+1, err)
		}
		p.objPositions = append(p.objPositions, v)
	case line[1] == 't' && len(line) > 2 && isBlank(line[2]):
		t, err := parseUV(line[3:])
		if err != nil {
			return fmt.Errorf("parseOBJ: uv line %d: %w", len(p.objUVs)+1, err)
		}
		p.objUVs = append(p.objUVs, t)
	}
	return nil
}

// parseMaterialLine handles "usemtl X" and "mtllib F".
func (p *parser) parseMaterialLine(line []byte) {
	if arg, ok := directiveArg(line, "usemtl"); ok {
		p.switchMaterial(string(bytes.TrimSpace(arg)))
	} else if arg, ok := directiveArg(line, "mtllib"); ok && p.mtllib == "" {
		// First mtllib wins. SketchUp exports rarely declare more than one;
		// when they do, all libs reference the same material names anyway.
		p.mtllib = string(bytes.TrimSpace(arg))
	}
}

// isBlank is the OBJ whitespace: a keyword may be followed by a space or a tab.
func isBlank(c byte) bool { return c == ' ' || c == '\t' }

// directiveArg returns the rest of line when it starts with name followed by a
// space or tab.
func directiveArg(line []byte, name string) ([]byte, bool) {
	n := len(name)
	if len(line) <= n || string(line[:n]) != name || !isBlank(line[n]) {
		return nil, false
	}
	return line[n:], true
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
