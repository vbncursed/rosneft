package catalog

import (
	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func territoryFromProto(t *catalogv1.Territory) domain.Territory {
	if t == nil {
		return domain.Territory{}
	}
	return domain.Territory{
		Slug:                t.GetSlug(),
		Title:               t.GetTitle(),
		Description:         t.GetDescription(),
		SourceBlobHash:      t.GetSourceBlobHash(),
		ExternalPanoramaURL: t.GetExternalPanoramaUrl(),
		CreatedAt:           t.GetCreatedAt().AsTime(),
		UpdatedAt:           t.GetUpdatedAt().AsTime(),
	}
}

func territoryToProto(t domain.Territory) *catalogv1.Territory {
	return &catalogv1.Territory{
		Slug:                t.Slug,
		Title:               t.Title,
		Description:         t.Description,
		SourceBlobHash:      t.SourceBlobHash,
		ExternalPanoramaUrl: t.ExternalPanoramaURL,
	}
}

func modelFromProto(m *catalogv1.Model) domain.Model {
	if m == nil {
		return domain.Model{}
	}
	return domain.Model{
		Slug:              m.GetSlug(),
		Title:             m.GetTitle(),
		Description:       m.GetDescription(),
		SourceBlobHash:    m.GetSourceBlobHash(),
		ThumbnailBlobHash: m.GetThumbnailBlobHash(),
		CreatedAt:         m.GetCreatedAt().AsTime(),
		UpdatedAt:         m.GetUpdatedAt().AsTime(),
	}
}

func modelToProto(m domain.Model) *catalogv1.Model {
	return &catalogv1.Model{
		Slug:              m.Slug,
		Title:             m.Title,
		Description:       m.Description,
		SourceBlobHash:    m.SourceBlobHash,
		ThumbnailBlobHash: m.ThumbnailBlobHash,
	}
}

func territoryArtifactFromProto(a *catalogv1.TerritoryArtifact) domain.Artifact {
	if a == nil {
		return domain.Artifact{}
	}
	return domain.Artifact{
		Slug:        a.GetTerritorySlug(),
		LOD:         a.GetLod(),
		Hash:        a.GetHash(),
		ContentType: a.GetContentType(),
		Size:        a.GetSize(),
		Vertices:    a.GetVertices(),
		Faces:       a.GetFaces(),
		BBoxMin:     vec3FromProto(a.GetBboxMin()),
		BBoxMax:     vec3FromProto(a.GetBboxMax()),
		CreatedAt:   a.GetCreatedAt().AsTime(),
	}
}

func modelArtifactFromProto(a *catalogv1.ModelArtifact) domain.Artifact {
	if a == nil {
		return domain.Artifact{}
	}
	return domain.Artifact{
		Slug:        a.GetModelSlug(),
		LOD:         a.GetLod(),
		Hash:        a.GetHash(),
		ContentType: a.GetContentType(),
		Size:        a.GetSize(),
		Vertices:    a.GetVertices(),
		Faces:       a.GetFaces(),
		BBoxMin:     vec3FromProto(a.GetBboxMin()),
		BBoxMax:     vec3FromProto(a.GetBboxMax()),
		CreatedAt:   a.GetCreatedAt().AsTime(),
	}
}

func vec3FromProto(v *catalogv1.Vec3) domain.Vec3 {
	if v == nil {
		return domain.Vec3{}
	}
	return domain.Vec3{X: v.GetX(), Y: v.GetY(), Z: v.GetZ()}
}

func vec3ToProto(v domain.Vec3) *catalogv1.Vec3 {
	return &catalogv1.Vec3{X: v.X, Y: v.Y, Z: v.Z}
}

func panoramaFromProto(p *catalogv1.Panorama) domain.Panorama {
	if p == nil {
		return domain.Panorama{}
	}
	return domain.Panorama{
		ID:             p.GetId(),
		TerritorySlug:  p.GetTerritorySlug(),
		Slug:           p.GetSlug(),
		Title:          p.GetTitle(),
		SourceBlobHash: p.GetSourceBlobHash(),
		Position:       vec3FromProto(p.GetPosition()),
		YawOffset:      p.GetYawOffset(),
		CreatedAt:      p.GetCreatedAt().AsTime(),
		UpdatedAt:      p.GetUpdatedAt().AsTime(),
	}
}

func documentFromProto(d *catalogv1.Document) domain.Document {
	if d == nil {
		return domain.Document{}
	}
	return domain.Document{
		ID:             d.GetId(),
		TerritorySlug:  d.GetTerritorySlug(),
		Title:          d.GetTitle(),
		SourceBlobHash: d.GetSourceBlobHash(),
		CreatedAt:      d.GetCreatedAt().AsTime(),
	}
}

func placementFromProto(p *catalogv1.Placement) domain.Placement {
	if p == nil {
		return domain.Placement{}
	}
	return domain.Placement{
		ID:                 p.GetId(),
		TerritorySlug:      p.GetTerritorySlug(),
		ModelSlug:          p.GetModelSlug(),
		Position:           vec3FromProto(p.GetPosition()),
		Rotation:           vec3FromProto(p.GetRotation()),
		Scale:              vec3FromProto(p.GetScale()),
		Label:              p.GetLabel(),
		CreatedAt:          p.GetCreatedAt().AsTime(),
		UpdatedAt:          p.GetUpdatedAt().AsTime(),
		VisiblePanoramaIDs: p.GetVisiblePanoramaIds(),
	}
}
