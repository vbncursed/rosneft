package objexport

import (
	"strconv"

	"github.com/qmuntal/gltf"
)

// appendNum appends v the way an OBJ number is written: the shortest text
// that round-trips the float32 an importer keeps, never an exponent, and
// never "-0".
func appendNum(b []byte, v float64) []byte {
	f := float32(v)
	if f == 0 {
		return append(b, '0')
	}
	return strconv.AppendFloat(b, float64(f), 'f', -1, 32)
}

// addMaterials numbers every material of a newly met input in array order
// and writes its MTL block; images get the next counter on first reference.
func (b *builder) addMaterials(in *input) error {
	in.mats = make([]string, len(in.doc.Materials))
	imgs := map[int]string{}
	for i, m := range in.doc.Materials {
		name := materialFile(b.matN, m.Name)
		b.matN++
		in.mats[i] = name
		if err := b.mtlBlock(in, imgs, name, m); err != nil {
			return err
		}
	}
	return nil
}

func (b *builder) mtlBlock(in *input, imgs map[int]string, name string, m *gltf.Material) error {
	kd := [4]float64{1, 1, 1, 1}
	var tex *gltf.TextureInfo
	if pbr := m.PBRMetallicRoughness; pbr != nil {
		kd, tex = pbr.BaseColorFactorOrDefault(), pbr.BaseColorTexture
	}
	file := ""
	if tex != nil {
		var err error
		if file, err = b.image(in, imgs, tex); err != nil {
			return err
		}
	}
	b.mtl = append(append(b.mtl, "newmtl "...), name...)
	b.mtl = append(b.mtl, "\nKd"...)
	for _, c := range kd[:3] {
		b.mtl = appendNum(append(b.mtl, ' '), c)
	}
	b.mtl = append(b.mtl, "\nKs 0 0 0\nNs 0\nillum 1\n"...)
	if kd[3] < 1 {
		b.mtl = append(appendNum(append(b.mtl, "d "...), kd[3]), '\n')
	}
	if file != "" {
		b.mtl = append(append(append(b.mtl, "map_Kd "...), file...), '\n')
	}
	b.mtl = append(b.mtl, '\n')
	return nil
}

// image resolves a base-colour texture to the file name its image ships as,
// registering the image on first sight.
func (b *builder) image(in *input, imgs map[int]string, t *gltf.TextureInfo) (string, error) {
	if t.TexCoord != 0 {
		return "", unsupported("baseColorTexture uses TEXCOORD_%d", t.TexCoord)
	}
	if t.Index < 0 || t.Index >= len(in.doc.Textures) {
		return "", malformed("texture %d out of range [0, %d)", t.Index, len(in.doc.Textures))
	}
	src := in.doc.Textures[t.Index].Source
	if src == nil {
		return "", unsupported("texture %d has no source", t.Index)
	}
	if *src < 0 || *src >= len(in.doc.Images) {
		return "", malformed("image %d out of range [0, %d)", *src, len(in.doc.Images))
	}
	if name, ok := imgs[*src]; ok {
		return name, nil
	}
	im := in.doc.Images[*src]
	if im.MimeType != "image/jpeg" && im.MimeType != "image/png" {
		return "", unsupported("image %d is %q", *src, im.MimeType)
	}
	if im.BufferView == nil {
		return "", unsupported("image %d is not in a bufferView", *src)
	}
	v, err := in.view(*im.BufferView)
	if err != nil {
		return "", err
	}
	name := imageFile(b.imgN, im.Name, im.MimeType)
	b.imgN++
	imgs[*src] = name
	b.images = append(
		b.images,
		imageRef{name: name, hash: in.hash, off: in.head.BinOffset + int64(v.ByteOffset), length: int64(v.ByteLength)},
	)
	return name, nil
}
