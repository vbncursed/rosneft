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
		PlacementCount:      uint32(t.PlacementCount),
		Artifacts:           artifactsToProto(t.Artifacts, territoryArtifactToProto),
	}
}

func territoryFromProto(t *catalogv1.Territory) domain.Territory {
	return domain.Territory{
		Slug:                t.GetSlug(),
		Title:               t.GetTitle(),
		Description:         t.GetDescription(),
		SourceBlobHash:      t.GetSourceBlobHash(),
		ExternalPanoramaURL: t.GetExternalPanoramaUrl(),
		PlacementCount:      int(t.GetPlacementCount()),
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
		UsageCount:        uint32(m.UsageCount),
		Artifacts:         artifactsToProto(m.Artifacts, modelArtifactToProto),
	}
}

func modelFromProto(m *catalogv1.Model) domain.Model {
	return domain.Model{
		Slug:              m.GetSlug(),
		Title:             m.GetTitle(),
		Description:       m.GetDescription(),
		SourceBlobHash:    m.GetSourceBlobHash(),
		ThumbnailBlobHash: m.GetThumbnailBlobHash(),
		UsageCount:        int(m.GetUsageCount()),
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
		Hidden:             p.Hidden,
		GroupId:            p.GroupID,
	}
}

func measurementToProto(m domain.Measurement) *catalogv1.Measurement {
	return &catalogv1.Measurement{
		Id:            m.ID,
		TerritorySlug: m.TerritorySlug,
		Points:        domain.FlattenPoints(m.Points),
		Closed:        m.Closed,
		CreatedAt:     timestamppb.New(m.CreatedAt),
		UpdatedAt:     timestamppb.New(m.UpdatedAt),
	}
}

// artifactsToProto maps a LOD chain with the per-kind converter.
func artifactsToProto[P any](in []domain.Artifact, conv func(domain.Artifact) P) []P {
	out := make([]P, len(in))
	for i, a := range in {
		out[i] = conv(a)
	}
	return out
}

// placementFromCreateRequest maps one create request (alone, or an item of a
// batch) onto a domain placement.
func placementFromCreateRequest(req *catalogv1.CreatePlacementRequest) domain.Placement {
	return domain.Placement{
		TerritorySlug:      req.GetTerritorySlug(),
		ModelSlug:          req.GetModelSlug(),
		Position:           vec3FromProto(req.GetPosition()),
		Rotation:           vec3FromProto(req.GetRotation()),
		Scale:              vec3FromProto(req.GetScale()),
		Label:              req.GetLabel(),
		VisiblePanoramaIDs: req.GetVisiblePanoramaIds(),
		GroupID:            req.GroupId,
	}
}

func placementGroupToProto(g domain.PlacementGroup) *catalogv1.PlacementGroup {
	return &catalogv1.PlacementGroup{
		Id:            g.ID,
		TerritorySlug: g.TerritorySlug,
		Title:         g.Title,
		CreatedAt:     timestamppb.New(g.CreatedAt),
		UpdatedAt:     timestamppb.New(g.UpdatedAt),
	}
}
