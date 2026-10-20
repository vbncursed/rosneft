package glbexport

import (
	"encoding/json"
	"maps"

	"github.com/qmuntal/gltf"
)

const extBasisu = "KHR_texture_basisu"

func (r *remap) textures() {
	for _, in := range r.src.Textures {
		t := *in
		t.Sampler = r.opt(in.Sampler, len(r.src.Samplers), r.smp, "sampler")
		t.Source = r.opt(in.Source, len(r.src.Images), r.img, "image")
		t.Extensions = r.basisu(in.Extensions)
		r.out.Textures = append(r.out.Textures, &t)
	}
}

// basisu shifts the KTX2 image a texture names through KHR_texture_basisu.
func (r *remap) basisu(ext gltf.Extensions) gltf.Extensions {
	raw, ok := ext[extBasisu]
	if !ok {
		return ext
	}
	data, _ := raw.(json.RawMessage)
	var fields map[string]json.RawMessage
	var source int
	if json.Unmarshal(data, &fields) != nil || json.Unmarshal(fields["source"], &source) != nil {
		r.fail(malformed("%s without a source", extBasisu))
		return ext
	}
	enc, err := json.Marshal(r.at(source, len(r.src.Images), r.img, "image"))
	if err != nil {
		r.fail(malformed("%s: %v", extBasisu, err))
		return ext
	}
	fields["source"] = enc
	out, err := json.Marshal(fields)
	if err != nil {
		r.fail(malformed("%s: %v", extBasisu, err))
		return ext
	}
	clone := maps.Clone(ext)
	clone[extBasisu] = json.RawMessage(out)
	return clone
}

func (r *remap) textureInfo(in *gltf.TextureInfo) *gltf.TextureInfo {
	if in == nil {
		return nil
	}
	t := *in
	t.Index = r.at(in.Index, len(r.src.Textures), r.tex, "texture")
	return &t
}

func (r *remap) materials() {
	for _, in := range r.src.Materials {
		m := *in
		if p := in.PBRMetallicRoughness; p != nil {
			q := *p
			q.BaseColorTexture = r.textureInfo(p.BaseColorTexture)
			q.MetallicRoughnessTexture = r.textureInfo(p.MetallicRoughnessTexture)
			m.PBRMetallicRoughness = &q
		}
		if n := in.NormalTexture; n != nil {
			q := *n
			q.Index = r.opt(n.Index, len(r.src.Textures), r.tex, "texture")
			m.NormalTexture = &q
		}
		if o := in.OcclusionTexture; o != nil {
			q := *o
			q.Index = r.opt(o.Index, len(r.src.Textures), r.tex, "texture")
			m.OcclusionTexture = &q
		}
		m.EmissiveTexture = r.textureInfo(in.EmissiveTexture)
		r.out.Materials = append(r.out.Materials, &m)
	}
}

func (r *remap) attributes(in gltf.PrimitiveAttributes) gltf.PrimitiveAttributes {
	if in == nil {
		return nil
	}
	out := make(gltf.PrimitiveAttributes, len(in))
	for name, i := range in {
		out[name] = r.at(i, len(r.src.Accessors), r.acc, "accessor")
	}
	return out
}

func (r *remap) meshes() {
	for _, in := range r.src.Meshes {
		m := *in
		m.Primitives = make([]*gltf.Primitive, len(in.Primitives))
		for i, ip := range in.Primitives {
			p := *ip
			p.Attributes = r.attributes(ip.Attributes)
			p.Indices = r.opt(ip.Indices, len(r.src.Accessors), r.acc, "accessor")
			p.Material = r.opt(ip.Material, len(r.src.Materials), r.mat, "material")
			if ip.Targets != nil {
				p.Targets = make([]gltf.PrimitiveAttributes, len(ip.Targets))
				for j, t := range ip.Targets {
					p.Targets[j] = r.attributes(t)
				}
			}
			m.Primitives[i] = &p
		}
		r.out.Meshes = append(r.out.Meshes, &m)
	}
}
