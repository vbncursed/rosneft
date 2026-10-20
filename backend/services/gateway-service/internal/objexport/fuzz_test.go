package objexport

import (
	"bytes"
	"testing"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// FuzzBuildWrite feeds arbitrary bytes through the gateway's path: a blob that
// reads as a head must never panic Build or Write, and a Write that succeeds
// must leave an archive that opens.
func FuzzBuildWrite(f *testing.F) {
	doc, bin := validDoc()
	f.Add(glbOf(f, doc, bin))
	f.Fuzz(func(t *testing.T, blob []byte) {
		h, err := glbexport.ReadHead(bytes.NewReader(blob))
		if err != nil {
			return
		}
		ps := []glbexport.Placement{place("x", "x"), place("x", "y")}
		ps[1].Scale = [3]float64{-1, 2, 1}
		plan, err := Build(ps, map[string]glbexport.Head{"x": h}, testOpts())
		if err != nil {
			return
		}
		var out bytes.Buffer
		if Write(t.Context(), &out, plan, (&source{blobs: map[string][]byte{"x": blob}}).open) != nil {
			return
		}
		unzip(t, out.Bytes())
	})
}
