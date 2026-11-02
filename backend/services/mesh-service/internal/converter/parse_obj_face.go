package converter

import (
	"bytes"
	"fmt"
)

// faceSep separates v/vt/vn inside one OBJ face token.
var faceSep = []byte{'/'}

// parseFace parses "v1[/vt1[/vn1]] v2 v3 [v4 ...]" and triangulates as a fan
// directly into the active group's triangle slice. Indices are 1-based in OBJ;
// negative values count from the current vertex/uv counts.
func (p *parser) parseFace(line []byte) error {
	p.ensureGroup()
	p.indicesBuf = p.indicesBuf[:0]

	for {
		line = trimLeadingSpace(line)
		if len(line) == 0 {
			break
		}
		var token []byte
		token, line = cutToken(line)
		outIdx, err := p.faceVertex(token)
		if err != nil {
			return err
		}
		p.indicesBuf = append(p.indicesBuf, outIdx)
	}
	if len(p.indicesBuf) < 3 {
		return fmt.Errorf("face needs >=3 indices, got %d", len(p.indicesBuf))
	}
	p.fanTriangulate()
	return nil
}

// cutToken splits off the leading run of non-blank bytes.
func cutToken(line []byte) (token, rest []byte) {
	end := 0
	for end < len(line) && line[end] != ' ' && line[end] != '\t' {
		end++
	}
	return line[:end], line[end:]
}

// faceVertex resolves one "v[/vt[/vn]]" token to its deduplicated output vertex.
func (p *parser) faceVertex(token []byte) (uint32, error) {
	vTok, rest, hasUV := bytes.Cut(token, faceSep)
	var vtTok []byte
	if hasUV {
		vtTok, _, _ = bytes.Cut(rest, faceSep)
	}

	vIdx, err := resolveIndex(vTok, len(p.objPositions), "v")
	if err != nil {
		return 0, err
	}
	var vtIdx int
	if len(vtTok) > 0 {
		if vtIdx, err = resolveIndex(vtTok, len(p.objUVs), "vt"); err != nil {
			return 0, err
		}
	} else {
		// Any face token without a UV index downgrades the whole mesh to
		// position-only — we cannot mix UV'd and unUV'd vertices in a
		// single primitive without padding.
		p.hasUVs = false
	}
	return p.outputVertex(vIdx, vtIdx), nil
}

// resolveIndex parses a 1-based OBJ index (negative counts back from count)
// and checks it against count. kind names the index in errors.
func resolveIndex(tok []byte, count int, kind string) (int, error) {
	idx, err := atoiBytes(tok)
	if err != nil {
		return 0, fmt.Errorf("face %s index %q: %w", kind, tok, err)
	}
	if idx < 0 {
		idx = count + idx + 1
	}
	if idx <= 0 || idx > count {
		return 0, fmt.Errorf("face %s index %d out of range (count=%d)", kind, idx, count)
	}
	return idx, nil
}

// outputVertex returns the output index of the (vIdx, vtIdx) pair, emitting
// the vertex on first sight. vtIdx == 0 means "no UV".
func (p *parser) outputVertex(vIdx, vtIdx int) uint32 {
	key := uint64(uint32(vIdx))<<32 | uint64(uint32(vtIdx))
	outIdx, exists := p.dedup[key]
	if exists {
		return outIdx
	}
	outIdx = uint32(len(p.outPositions))
	p.outPositions = append(p.outPositions, p.objPositions[vIdx-1])
	if vtIdx > 0 {
		p.outUVs = append(p.outUVs, p.objUVs[vtIdx-1])
	} else {
		p.outUVs = append(p.outUVs, uv{})
	}
	p.dedup[key] = outIdx
	return outIdx
}

// fanTriangulate appends the fan of indicesBuf to the active group — no
// intermediate buffer.
func (p *parser) fanTriangulate() {
	g := &p.groups[p.currentGroup]
	pivot := p.indicesBuf[0]
	for i := 1; i < len(p.indicesBuf)-1; i++ {
		g.triangles = append(g.triangles, triangle{pivot, p.indicesBuf[i], p.indicesBuf[i+1]})
	}
}
