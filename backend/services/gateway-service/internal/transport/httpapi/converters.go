package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func territoryToAPI(t domain.Territory) Territory {
	out := Territory{
		Slug:           t.Slug,
		Title:          t.Title,
		SourceBlobHash: t.SourceBlobHash,
	}
	if t.Description != "" {
		out.Description = &t.Description
	}
	if t.ExternalPanoramaURL != "" {
		out.ExternalPanoramaUrl = &t.ExternalPanoramaURL
	}
	if !t.CreatedAt.IsZero() {
		out.CreatedAt = &t.CreatedAt
	}
	if !t.UpdatedAt.IsZero() {
		out.UpdatedAt = &t.UpdatedAt
	}
	return out
}

func modelToAPI(m domain.Model) Model {
	out := Model{
		Slug:           m.Slug,
		Title:          m.Title,
		SourceBlobHash: m.SourceBlobHash,
	}
	if m.Description != "" {
		out.Description = &m.Description
	}
	if !m.CreatedAt.IsZero() {
		out.CreatedAt = &m.CreatedAt
	}
	if !m.UpdatedAt.IsZero() {
		out.UpdatedAt = &m.UpdatedAt
	}
	return out
}

func vec3ToAPI(v domain.Vec3) Vec3 { return Vec3{X: v.X, Y: v.Y, Z: v.Z} }

func vec3FromAPI(v Vec3) domain.Vec3 { return domain.Vec3{X: v.X, Y: v.Y, Z: v.Z} }

func vec3PtrFromAPI(v *Vec3) domain.Vec3 {
	if v == nil {
		return domain.Vec3{}
	}
	return vec3FromAPI(*v)
}

func artifactToAPI(a domain.Artifact, withChain bool) Artifact {
	verts := int64(a.Vertices)
	faces := int64(a.Faces)
	out := Artifact{
		Slug:        a.Slug,
		Lod:         int32(a.LOD),
		Hash:        a.Hash,
		ContentType: a.ContentType,
		Size:        a.Size,
		Vertices:    &verts,
		Faces:       &faces,
	}
	bbMin := vec3ToAPI(a.BBoxMin)
	bbMax := vec3ToAPI(a.BBoxMax)
	out.BboxMin = &bbMin
	out.BboxMax = &bbMax
	if !a.CreatedAt.IsZero() {
		out.CreatedAt = &a.CreatedAt
	}
	if withChain && len(a.LODs) > 0 {
		chain := lodChainToAPI(a.LODs)
		out.Artifacts = &chain
	}
	return out
}

func lodChainToAPI(in []domain.LodArtifact) []LodArtifact {
	out := make([]LodArtifact, len(in))
	for i, l := range in {
		verts := int64(l.Vertices)
		faces := int64(l.Faces)
		out[i] = LodArtifact{
			Lod:      int32(l.LOD),
			Hash:     l.Hash,
			Size:     l.Size,
			Vertices: &verts,
			Faces:    &faces,
		}
	}
	return out
}

func placementToAPI(p domain.Placement) Placement {
	out := Placement{
		Id:            p.ID,
		TerritorySlug: p.TerritorySlug,
		ModelSlug:     p.ModelSlug,
		Position:      vec3ToAPI(p.Position),
		Rotation:      vec3ToAPI(p.Rotation),
		Scale:         vec3ToAPI(p.Scale),
	}
	if p.Label != "" {
		out.Label = &p.Label
	}
	if !p.CreatedAt.IsZero() {
		out.CreatedAt = &p.CreatedAt
	}
	if !p.UpdatedAt.IsZero() {
		out.UpdatedAt = &p.UpdatedAt
	}
	// Always emit the allowlist (as [] when empty) so the client can filter
	// deterministically instead of guessing at an absent field.
	ids := p.VisiblePanoramaIDs
	if ids == nil {
		ids = []int64{}
	}
	out.VisiblePanoramaIds = &ids
	return out
}

func jobToAPI(j domain.Job) Job {
	out := Job{
		Id:     j.ID,
		Kind:   JobKind(j.Kind),
		Slug:   j.Slug,
		Status: JobStatus(j.Status),
	}
	if j.ErrorMessage != "" {
		out.ErrorMessage = &j.ErrorMessage
	}
	if j.ArtifactHash != "" {
		out.ArtifactHash = &j.ArtifactHash
	}
	if j.Progress > 0 {
		p := j.Progress
		out.Progress = &p
	}
	if j.Stage != "" {
		out.Stage = &j.Stage
	}
	if !j.CreatedAt.IsZero() {
		out.CreatedAt = &j.CreatedAt
	}
	if !j.UpdatedAt.IsZero() {
		out.UpdatedAt = &j.UpdatedAt
	}
	return out
}

func panoramaToAPI(p domain.Panorama) Panorama {
	out := Panorama{
		Id:             p.ID,
		TerritorySlug:  p.TerritorySlug,
		Slug:           p.Slug,
		Title:          p.Title,
		SourceBlobHash: p.SourceBlobHash,
		Position:       vec3ToAPI(p.Position),
		YawOffset:      p.YawOffset,
	}
	if !p.CreatedAt.IsZero() {
		out.CreatedAt = &p.CreatedAt
	}
	if !p.UpdatedAt.IsZero() {
		out.UpdatedAt = &p.UpdatedAt
	}
	return out
}

func sceneBundleToAPI(b domain.SceneBundle) SceneBundle {
	out := SceneBundle{
		Territory:    territoryToAPI(b.Territory),
		Placements:   make([]Placement, len(b.Placements)),
		ModelOptions: make([]AssetOption, len(b.ModelOptions)),
	}
	for i, p := range b.Placements {
		out.Placements[i] = placementToAPI(p)
	}
	for i, m := range b.ModelOptions {
		opt := AssetOption{
			Slug:      m.Slug,
			Title:     m.Title,
			Artifacts: lodChainToAPI(m.LODs),
		}
		if m.BBoxMin != nil {
			bb := vec3ToAPI(*m.BBoxMin)
			opt.BboxMin = &bb
		}
		if m.BBoxMax != nil {
			bb := vec3ToAPI(*m.BBoxMax)
			opt.BboxMax = &bb
		}
		out.ModelOptions[i] = opt
	}
	if b.Artifact != nil {
		a := artifactToAPI(*b.Artifact, true)
		out.Artifact = &a
	}
	if len(b.Panoramas) > 0 {
		pans := make([]Panorama, len(b.Panoramas))
		for i, p := range b.Panoramas {
			pans[i] = panoramaToAPI(p)
		}
		out.Panoramas = &pans
	}
	return out
}
