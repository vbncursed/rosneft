package objexport

import (
	"cmp"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// objectName is an `o` line's text: control bytes and '#' become '_', UTF-8
// is kept, and an empty name reads "unnamed" so no bare `o` line is written.
func objectName(s string) string {
	if s == "" {
		return "unnamed"
	}
	b := []byte(s)
	for i, c := range b {
		if c < 0x20 || c == 0x7F || c == '#' {
			b[i] = '_'
		}
	}
	return string(b)
}

// token reduces s to [A-Za-z0-9._-], one '_' per other rune, cut to 48 bytes.
func token(s string) string {
	var sb strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '_', r == '-':
			sb.WriteRune(r)
		default:
			sb.WriteByte('_')
		}
	}
	return sb.String()[:min(sb.Len(), maxToken)]
}

func materialFile(n int, name string) string {
	return fmt.Sprintf("m%03d_%s", n, cmp.Or(token(name), "material"))
}

// imageFile names an image: its name without a trailing .png/.jpg/.jpeg.
func imageFile(n int, name, mime string) string {
	for _, ext := range []string{".jpeg", ".jpg", ".png"} {
		if len(name) >= len(ext) && strings.EqualFold(name[len(name)-len(ext):], ext) {
			name = name[:len(name)-len(ext)]
			break
		}
	}
	ext := "jpg"
	if mime == "image/png" {
		ext = "png"
	}
	return fmt.Sprintf("t%03d_%s.%s", n, cmp.Or(token(name), "image"), ext)
}

func stemOf(slug string) string { return cmp.Or(token(slug), "territory") }

// UnitRatio is the factor from scene units to metres as the viewer measures
// them: half the longest side of the territory's bounding box. A box that is
// empty, inverted or not finite gives (1, false).
func UnitRatio(lo, hi [3]float64) (ratio float64, metric bool) {
	var span float64
	for i := range 3 {
		d := hi[i] - lo[i]
		if math.IsNaN(d) || math.IsInf(d, 0) || d < 0 {
			return 1, false
		}
		span = max(span, d)
	}
	if span == 0 {
		return 1, false
	}
	return span / 2, true
}

func unitsPhrase(ratio float64, metric bool) string {
	if !metric {
		return "scene units (size unknown)"
	}
	return "metres as the viewer measures them, i.e. the source file's own units (1 scene unit = " +
		strconv.FormatFloat(ratio, 'f', -1, 64) + " m)"
}

const blenderHint = "Blender: File > Import > Wavefront (.obj), Up Axis Z, Forward Axis Y"

func headerText(stem, units string) string {
	return "# rosneft territory export\n# Z up, Y forward; units: " + units + "\n# " + blenderHint + "\nmtllib " + stem + ".mtl\n"
}

func readmeText(stem, units string) string {
	return stem + ".obj holds the territory and every visible placement, one object each; " +
		stem + ".mtl and the image files beside it are its materials and textures.\n" +
		"Axes: Z up, Y forward (right-handed).\n" +
		"Units: " + units + ".\n" +
		blenderHint + ".\n" +
		"The territory is centred on its middle; the source file's origin is not restored.\n"
}
