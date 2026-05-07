package converter

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"strconv"
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
	flush := func() {
		if cur != nil {
			mats = append(mats, *cur)
			cur = nil
		}
	}

	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] == '#' {
			continue
		}
		key, rest := splitDirective(line)
		switch string(key) {
		case "newmtl":
			flush()
			cur = &material{
				name:  string(bytes.TrimSpace(rest)),
				kd:    [3]float32{1, 1, 1},
				alpha: 1,
			}
		case "Kd":
			if cur == nil {
				continue
			}
			r, g, b, err := parseTriplet(rest)
			if err != nil {
				return nil, fmt.Errorf("parseMTL: Kd %q: %w", rest, err)
			}
			cur.kd = [3]float32{r, g, b}
		case "d":
			if cur == nil {
				continue
			}
			v, err := parseSingleFloat(rest)
			if err != nil {
				return nil, fmt.Errorf("parseMTL: d %q: %w", rest, err)
			}
			cur.alpha = v
		case "Tr":
			if cur == nil {
				continue
			}
			v, err := parseSingleFloat(rest)
			if err != nil {
				return nil, fmt.Errorf("parseMTL: Tr %q: %w", rest, err)
			}
			cur.alpha = 1 - v
		case "map_Kd":
			if cur == nil {
				continue
			}
			cur.diffuseMap = stripMapOptions(string(bytes.TrimSpace(rest)))
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("parseMTL: scan: %w", err)
	}
	flush()
	return mats, nil
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

// mapKdFlagArgs is the argument count for each MTL texture-option flag we
// know about. The list comes from the Wavefront MTL spec — anything not
// listed defaults to 1 argument, which covers the long tail of vendor flags
// gracefully.
var mapKdFlagArgs = map[string]int{
	"-blendu":  1,
	"-blendv":  1,
	"-cc":      1,
	"-clamp":   1,
	"-mm":      2,
	"-o":       3,
	"-s":       3,
	"-t":       3,
	"-texres":  1,
	"-imfchan": 1,
	"-bm":      1,
	"-type":    1,
	"-boost":   1,
}

// stripMapOptions consumes the `-flag value [value...]` prefixes that some
// exporters emit before the texture path on a `map_Kd` line. The remainder
// is returned verbatim — including spaces, which SketchUp exports happily
// embed in directory names.
func stripMapOptions(s string) string {
	for {
		s = trimLeftSpace(s)
		if len(s) == 0 || s[0] != '-' {
			return s
		}
		flag, rest := splitToken(s)
		argc, ok := mapKdFlagArgs[flag]
		if !ok {
			argc = 1
		}
		s = rest
		for i := 0; i < argc; i++ {
			s = trimLeftSpace(s)
			_, s = splitToken(s)
		}
	}
}

// splitToken returns (firstWhitespaceDelimitedToken, remainder).
func splitToken(s string) (string, string) {
	end := 0
	for end < len(s) && s[end] != ' ' && s[end] != '\t' {
		end++
	}
	return s[:end], s[end:]
}

func trimLeftSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	return s
}
