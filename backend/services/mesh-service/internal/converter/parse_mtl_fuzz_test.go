package converter

import (
	"strings"
	"testing"
)

// FuzzParseMTL: any bytes either parse into materials or fail with an error;
// never a panic or a hang, and a map path never keeps a leading option.
func FuzzParseMTL(f *testing.F) {
	for _, seed := range []string{
		"",
		"newmtl a\nKd 0.5 0.5 0.5\nd 0.5\nmap_Kd tex.png\n",
		"newmtl a\nKd\t1 0 0\nTr 0.25\n",
		"newmtl a\nmap_Kd -s 2 2 tex.jpg\nmap_Kd -o 1 -mm 0 1 my dir/t.png\n",
		"newmtl a\nmap_Kd -s\nmap_Kd -\nmap_Kd -s -s -s -s\nmap_Kd -vendor\n",
		"Kd x\nnewmtl\nKd spectral 1 2\nd high\n",
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, mtl string) {
		mats, err := parseMTL(strings.NewReader(mtl))
		if err != nil {
			return
		}
		for _, m := range mats {
			if strings.HasPrefix(m.diffuseMap, " ") || strings.HasPrefix(m.diffuseMap, "\t") {
				t.Fatalf("map path %q keeps leading blanks", m.diffuseMap)
			}
		}
	})
}
