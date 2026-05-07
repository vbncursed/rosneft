package converter

import (
	"bytes"
	"fmt"
	"testing"
)

// BenchmarkParseOBJ_10k measures throughput and allocations on a synthetic
// OBJ of 10 000 vertices and ~3 333 fan-triangulated quads. b.SetBytes lets
// `go test -bench` report MB/s.
func BenchmarkParseOBJ_10k(b *testing.B) {
	obj := genOBJ(10_000)
	b.SetBytes(int64(len(obj)))
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		if _, err := parseOBJ(bytes.NewReader(obj)); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkParseOBJ_100k stresses the parser at 100 000 vertices — enough
// for slice growth costs to matter and for allocation pressure to surface.
func BenchmarkParseOBJ_100k(b *testing.B) {
	obj := genOBJ(100_000)
	b.SetBytes(int64(len(obj)))
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		if _, err := parseOBJ(bytes.NewReader(obj)); err != nil {
			b.Fatal(err)
		}
	}
}

// genOBJ produces n vertex lines and n triangle lines. Floats use 6 digits
// to mimic real photogrammetry output.
func genOBJ(n int) []byte {
	var buf bytes.Buffer
	buf.Grow(n * 60)
	for i := range n {
		fmt.Fprintf(&buf, "v %.6f %.6f %.6f\n", float64(i)*0.123, float64(i)*0.456, float64(i)*0.789)
	}
	// Tri-fan over consecutive vertices: produces n triangles for n+2 verts.
	for i := 1; i+2 <= n; i++ {
		fmt.Fprintf(&buf, "f %d %d %d\n", i, i+1, i+2)
	}
	return buf.Bytes()
}
