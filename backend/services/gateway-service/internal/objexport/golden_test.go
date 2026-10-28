package objexport

import (
	"archive/zip"
	"bytes"
	"io"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type GoldenSuite struct{ suite.Suite }

func TestGoldenSuite(t *testing.T) { suite.Run(t, new(GoldenSuite)) }

const goldenOBJ = `# rosneft territory export
# Z up, Y forward; units: metres as the viewer measures them, i.e. the source file's own units (1 scene unit = 2 m)
# Blender: File > Import > Wavefront (.obj), Up Axis Z, Forward Axis Y
mtllib ust-kut.mtl
o Усть-Кут
v 0 0 0
v 2 0 0
v 2 -2 0
v 0 -2 0
vt 0 1
vt 1 1
vt 1 0
vt 0 0
usemtl m000_Ground
f 1/1 2/2 3/3
f 1/1 3/3 4/4
o Tank 1
v 2 0 0
v 4 0 0
v 2 0 2
vt 0 1
vt 1 1
vt 0 0
usemtl m001_Material
f 5/5 6/6 7/7
o Tank_2
v 0 -2 0
v 2 -2 0
v 0 -2 2
vt 0 1
vt 1 1
vt 0 0
usemtl m001_Material
f 8/8 9/9 10/10
`

const goldenMTL = `newmtl m000_Ground
Kd 1 1 1
Ks 0 0 0
Ns 0
illum 1
map_Kd t000_textures_ground.png

newmtl m001_Material
Kd 0.5 0.5 0.5
Ks 0 0 0
Ns 0
illum 1
d 0.5
map_Kd t001_tex.jpg

`

const goldenREADME = `ust-kut.obj holds the territory and every visible placement, one object each; ust-kut.mtl and the image files beside it are its materials and textures.
Axes: Z up, Y forward (right-handed).
Units: metres as the viewer measures them, i.e. the source file's own units (1 scene unit = 2 m).
Blender: File > Import > Wavefront (.obj), Up Axis Z, Forward Axis Y.
SketchUp / CAD: OBJ stores no units, so import with units set to Meters and Z up.
The territory is centred on its middle; the source file's origin is not restored.
`

func (s *GoldenSuite) TestGoldenArchive() {
	t := s.T()
	terrMesh := tri([3]float32{0, 0, 0}, [3]float32{1, 0, 0}, [3]float32{1, 0, 1}, [3]float32{0, 0, 1})
	terrMesh.uv = [][2]float32{{0, 0}, {1, 0}, {1, 1}, {0, 1}}
	terrMesh.idx = []uint32{0, 1, 2, 0, 2, 3}
	terr, terrBin := docOf(terrMesh)
	terrBin, tex := withImage(terr, terrBin, "textures/ground.png", "image/png")
	terr.Meshes[0].Primitives[0].Material = new(withMaterial(terr, "Ground", tex, [4]float64{1, 1, 1, 1}))

	tankMesh := tri(corners...)
	tankMesh.uv = [][2]float32{{0, 0}, {1, 0}, {0, 1}}
	tank, tankBin := docOf(tankMesh)
	tankBin, tex = withImage(tank, tankBin, "tex.jpg", "image/jpeg")
	tank.Meshes[0].Primitives[0].Material = new(withMaterial(tank, "Material", tex, [4]float64{0.5, 0.5, 0.5, 0.5}))

	blobs := map[string][]byte{"terr": glbOf(t, terr, terrBin), "tank": glbOf(t, tank, tankBin)}
	heads := map[string]glbexport.Head{"terr": headOf(t, blobs["terr"]), "tank": headOf(t, blobs["tank"])}
	ps := []glbexport.Placement{place("terr", "Усть-Кут"), place("tank", "Tank 1"), place("tank", "Tank\n2")}
	ps[1].Translation = [3]float64{1, 0, 0}
	ps[2].Translation = [3]float64{0, 0, 1}
	opts := testOpts()
	opts.Ratio = 2

	plan, err := Build(ps, heads, opts)
	assert.NilError(t, err)
	var out bytes.Buffer
	assert.NilError(t, Write(t.Context(), &out, plan, (&source{blobs: blobs}).open))

	zr, err := zip.NewReader(bytes.NewReader(out.Bytes()), int64(out.Len()))
	assert.NilError(t, err)
	got := map[string]string{}
	names := make([]string, 0, len(zr.File))
	for _, f := range zr.File {
		assert.Equal(t, f.Method, zip.Deflate, f.Name)
		assert.Equal(t, f.Modified.Unix(), fixedTime.Unix(), f.Name)
		rc, err := f.Open()
		assert.NilError(t, err)
		b, err := io.ReadAll(rc)
		assert.NilError(t, err)
		assert.NilError(t, rc.Close())
		got[f.Name], names = string(b), append(names, f.Name)
	}
	assert.DeepEqual(
		t,
		names,
		[]string{"README.txt", "ust-kut.mtl", "t000_textures_ground.png", "t001_tex.jpg", "ust-kut.obj"},
	)
	assert.Equal(t, got["README.txt"], goldenREADME)
	assert.Equal(t, got["ust-kut.mtl"], goldenMTL)
	assert.Equal(t, got["ust-kut.obj"], goldenOBJ)
	assert.Equal(t, got["t000_textures_ground.png"], "img:textures/ground.png")
	assert.Equal(t, got["t001_tex.jpg"], "img:tex.jpg")
}
