package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func territoryToProto(t domain.Territory) *catalogv1.Territory {
	return &catalogv1.Territory{
		Slug:                t.Slug,
		Title:               t.Title,
		Description:         t.Description,
		SourceBlobHash:      t.SourceBlobHash,
		ExternalPanoramaUrl: t.ExternalPanoramaURL,
		CreatedAt:           timestamppb.New(t.CreatedAt),
		UpdatedAt:           timestamppb.New(t.UpdatedAt),
	}
}

func territoryFromProto(t *catalogv1.Territory) domain.Territory {
	return domain.Territory{
		Slug:                t.GetSlug(),
		Title:               t.GetTitle(),
		Description:         t.GetDescription(),
		SourceBlobHash:      t.GetSourceBlobHash(),
		ExternalPanoramaURL: t.GetExternalPanoramaUrl(),
	}
}

func modelToProto(m domain.Model) *catalogv1.Model {
	return &catalogv1.Model{
		Slug:              m.Slug,
		Title:             m.Title,
		Description:       m.Description,
		SourceBlobHash:    m.SourceBlobHash,
		ThumbnailBlobHash: m.ThumbnailBlobHash,
		CreatedAt:         timestamppb.New(m.CreatedAt),
		UpdatedAt:         timestamppb.New(m.UpdatedAt),
	}
}

func modelFromProto(m *catalogv1.Model) domain.Model {
	return domain.Model{
		Slug:              m.GetSlug(),
		Title:             m.GetTitle(),
		Description:       m.GetDescription(),
		SourceBlobHash:    m.GetSourceBlobHash(),
		ThumbnailBlobHash: m.GetThumbnailBlobHash(),
	}
}

func territoryArtifactToProto(a domain.Artifact) *catalogv1.TerritoryArtifact {
	return &catalogv1.TerritoryArtifact{
		TerritorySlug: a.Slug,
		Lod:           a.LOD,
		Hash:          a.Hash,
		ContentType:   a.ContentType,
		Size:          a.Size,
		Vertices:      a.Vertices,
		Faces:         a.Faces,
		BboxMin:       vec3ToProto(a.BBoxMin),
		BboxMax:       vec3ToProto(a.BBoxMax),
		CreatedAt:     timestamppb.New(a.CreatedAt),
	}
}

func territoryArtifactFromProto(a *catalogv1.TerritoryArtifact) domain.Artifact {
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
	}
}

func modelArtifactToProto(a domain.Artifact) *catalogv1.ModelArtifact {
	return &catalogv1.ModelArtifact{
		ModelSlug:   a.Slug,
		Lod:         a.LOD,
		Hash:        a.Hash,
		ContentType: a.ContentType,
		Size:        a.Size,
		Vertices:    a.Vertices,
		Faces:       a.Faces,
		BboxMin:     vec3ToProto(a.BBoxMin),
		BboxMax:     vec3ToProto(a.BBoxMax),
		CreatedAt:   timestamppb.New(a.CreatedAt),
	}
}

func modelArtifactFromProto(a *catalogv1.ModelArtifact) domain.Artifact {
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
	}
}

func vec3ToProto(v domain.Vec3) *catalogv1.Vec3 {
	return &catalogv1.Vec3{X: v.X, Y: v.Y, Z: v.Z}
}

func vec3FromProto(v *catalogv1.Vec3) domain.Vec3 {
	if v == nil {
		return domain.Vec3{}
	}
	return domain.Vec3{X: v.GetX(), Y: v.GetY(), Z: v.GetZ()}
}

func panoramaToProto(p domain.Panorama) *catalogv1.Panorama {
	return &catalogv1.Panorama{
		Id:             p.ID,
		TerritorySlug:  p.TerritorySlug,
		Slug:           p.Slug,
		Title:          p.Title,
		SourceBlobHash: p.SourceBlobHash,
		Position:       vec3ToProto(p.Position),
		YawOffset:      p.YawOffset,
		CreatedAt:      timestamppb.New(p.CreatedAt),
		UpdatedAt:      timestamppb.New(p.UpdatedAt),
	}
}

func documentToProto(d domain.Document) *catalogv1.Document {
	return &catalogv1.Document{
		Id:             d.ID,
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
		CreatedAt:      timestamppb.New(d.CreatedAt),
	}
}

func placementToProto(p domain.Placement) *catalogv1.Placement {
	return &catalogv1.Placement{
		Id:                 p.ID,
		TerritorySlug:      p.TerritorySlug,
		ModelSlug:          p.ModelSlug,
		Position:           vec3ToProto(p.Position),
		Rotation:           vec3ToProto(p.Rotation),
		Scale:              vec3ToProto(p.Scale),
		Label:              p.Label,
		CreatedAt:          timestamppb.New(p.CreatedAt),
		UpdatedAt:          timestamppb.New(p.UpdatedAt),
		VisiblePanoramaIds: p.VisiblePanoramaIDs,
	}
}
