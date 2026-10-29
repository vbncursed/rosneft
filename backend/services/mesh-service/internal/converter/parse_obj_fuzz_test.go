package converter

import (
	"strings"
	"testing"
)

// FuzzParseOBJ: any bytes either parse into a consistent source or fail with
// an error; never a panic, never an index outside the output arrays.
func FuzzParseOBJ(f *testing.F) {
	for _, seed := range []string{
		"",
		"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
		"v\t0 0 0\nv\t1 0 0\nv\t0 1 0\nf\t1 2 3\n",
		"v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl m\nf 1/1/1 2/2/1 3/3/1\n",
		"mtllib a.mtl\nv 1 2 3\nf -1 -1 -1\nf 9999999999 1 1\nf 1// 2// 3//\n",
		"v nan inf 1e999\nvt\nvn\nf\nf 1\nusemtl\n",
	} {
		f.Add(seed, true)
		f.Add(seed, false)
	}
	f.Fuzz(func(t *testing.T, obj string, yUp bool) {
		src, err := parseOBJWithUp(strings.NewReader(obj), yUp)
		if err != nil {
			return
		}
		if src.hasUVs && len(src.uvs) != len(src.positions) {
			t.Fatalf("uvs %d not aligned with positions %d", len(src.uvs), len(src.positions))
		}
		for _, g := range src.groups {
			for _, tri := range g.triangles {
				for _, i := range tri {
					if int(i) >= len(src.positions) {
						t.Fatalf("index %d outside %d positions", i, len(src.positions))
					}
				}
			}
		}
	})
}
