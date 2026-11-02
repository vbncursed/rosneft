package converter

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"strconv"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// material is the subset of MTL we care about: a diffuse colour, an opacity
// scalar, and an optional map_Kd texture path. Everything else (Ks/Ns/illum)
// is ignored — photogrammetry and SketchUp meshes alike map cleanly to glTF
// with just baseColorFactor + baseColorTexture.
//
// diffuseMap is the value of `map_Kd` exactly as it appears in the file
// (relative to the MTL directory). Resolution to an absolute path happens in
// the caller, after all texture-option suffixes are stripped.
type material struct {
	name       string
	kd         [3]float32
	alpha      float32
	diffuseMap string
}

// parseMTL stream-parses an MTL file into an ordered list of materials.
// Lines that are not part of the supported subset are silently skipped —
// SketchUp/Blender exports often add Ka, Ks, Ns, illum, etc. that have no
// glTF analogue.
//
// `d` is opacity (1 = opaque); `Tr` is transparency (1 = transparent).
// Whichever appears last wins, which matches Blender's behaviour.
func parseMTL(r io.Reader) ([]material, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1<<16), 1<<20)

	var (
		mats []material
		cur  *material
	)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] == '#' {
			continue
		}
		key, rest := splitDirective(line)
		if string(key) == "newmtl" {
			// cur points into mats and is replaced before the next append.
			mats = append(mats, newMaterial(rest))
			cur = &mats[len(mats)-1]
			continue
		}
		apply, known := mtlDirectives[string(key)]
		if !known || cur == nil {
			continue
		}
		if err := apply(cur, rest); err != nil {
			return nil, fmt.Errorf("%w: parseMTL: %s %q: %w", domain.ErrBadSource, key, rest, err)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("%w: parseMTL: scan: %w", domain.ErrBadSource, err)
	}
	return mats, nil
}

// newMaterial starts a material from a `newmtl` line: white, opaque, no map.
func newMaterial(rest []byte) material {
	return material{
		name:  string(bytes.TrimSpace(rest)),
		kd:    [3]float32{1, 1, 1},
		alpha: 1,
	}
}

// mtlDirectives maps each supported directive to the setter that applies it
// to the current material; every other directive is skipped.
var mtlDirectives = map[string]func(m *material, rest []byte) error{
	"Kd": func(m *material, rest []byte) error {
		r, g, b, err := parseTriplet(rest)
		m.kd = [3]float32{r, g, b}
		return err
	},
	"d": func(m *material, rest []byte) error {
		v, err := parseSingleFloat(rest)
		m.alpha = v
		return err
	},
	"Tr": func(m *material, rest []byte) error {
		v, err := parseSingleFloat(rest)
		m.alpha = 1 - v
		return err
	},
	"map_Kd": func(m *material, rest []byte) error {
		m.diffuseMap = stripMapOptions(string(bytes.TrimSpace(rest)))
		return nil
	},
}

// splitDirective splits "Kd 1 0 0" into ("Kd", " 1 0 0"). Multi-word
// directives (none in the supported subset) would need more care.
func splitDirective(line []byte) ([]byte, []byte) {
	if i := bytes.IndexAny(line, " \t"); i >= 0 {
		return line[:i], line[i+1:]
	}
	return line, nil
}

func parseTriplet(b []byte) (float32, float32, float32, error) {
	r, b, err := nextFloat32(b)
	if err != nil {
		return 0, 0, 0, err
	}
	g, b, err := nextFloat32(b)
	if err != nil {
		return 0, 0, 0, err
	}
	bb, _, err := nextFloat32(b)
	if err != nil {
		return 0, 0, 0, err
	}
	return r, g, bb, nil
}

func parseSingleFloat(b []byte) (float32, error) {
	b = trimLeadingSpace(b)
	end := 0
	for end < len(b) && b[end] != ' ' && b[end] != '\t' {
		end++
	}
	if end == 0 {
		return 0, fmt.Errorf("expected float")
	}
	f, err := strconv.ParseFloat(bytesAsString(b[:end]), 32)
	if err != nil {
		return 0, err
	}
	return float32(f), nil
}
