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
	if m.ThumbnailBlobHash != "" {
		out.ThumbnailBlobHash = &m.ThumbnailBlobHash
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
	out := Artifact{
		Slug:        a.Slug,
		Lod:         int32(a.LOD),
		Hash:        a.Hash,
		ContentType: a.ContentType,
		Size:        a.Size,
		Vertices:    new(int64(a.Vertices)),
		Faces:       new(int64(a.Faces)),
	}
	out.BboxMin = new(vec3ToAPI(a.BBoxMin))
	out.BboxMax = new(vec3ToAPI(a.BBoxMax))
	if !a.CreatedAt.IsZero() {
		out.CreatedAt = &a.CreatedAt
	}
	if withChain && len(a.LODs) > 0 {
		out.Artifacts = new(lodChainToAPI(a.LODs))
	}
	return out
}

func lodChainToAPI(in []domain.LodArtifact) []LodArtifact {
	out := make([]LodArtifact, len(in))
	for i, l := range in {
		out[i] = LodArtifact{
			Lod:      int32(l.LOD),
			Hash:     l.Hash,
			Size:     l.Size,
			Vertices: new(int64(l.Vertices)),
			Faces:    new(int64(l.Faces)),
		}
	}
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
		out.Progress = new(j.Progress)
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
		DefaultYaw:     p.DefaultYaw,
	}
	if !p.CreatedAt.IsZero() {
		out.CreatedAt = &p.CreatedAt
	}
	if !p.UpdatedAt.IsZero() {
		out.UpdatedAt = &p.UpdatedAt
	}
	return out
}

func documentToAPI(d domain.Document) Document {
	out := Document{
		Id:             d.ID,
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
	}
	if !d.CreatedAt.IsZero() {
		out.CreatedAt = &d.CreatedAt
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
		if m.ThumbnailBlobHash != "" {
			opt.ThumbnailBlobHash = &m.ThumbnailBlobHash
		}
		if m.BBoxMin != nil {
			opt.BboxMin = new(vec3ToAPI(*m.BBoxMin))
		}
		if m.BBoxMax != nil {
			opt.BboxMax = new(vec3ToAPI(*m.BBoxMax))
		}
		out.ModelOptions[i] = opt
	}
	if b.Artifact != nil {
		out.Artifact = new(artifactToAPI(*b.Artifact, true))
	}
	if len(b.Panoramas) > 0 {
		pans := make([]Panorama, len(b.Panoramas))
		for i, p := range b.Panoramas {
			pans[i] = panoramaToAPI(p)
		}
		out.Panoramas = &pans
	}
	if len(b.Documents) > 0 {
		docs := make([]Document, len(b.Documents))
		for i, d := range b.Documents {
			docs[i] = documentToAPI(d)
		}
		out.Documents = &docs
	}
	return out
}
