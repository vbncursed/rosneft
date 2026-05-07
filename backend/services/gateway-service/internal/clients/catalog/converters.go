package catalog

import (
	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func projectFromProto(p *catalogv1.Project) domain.Project {
	if p == nil {
		return domain.Project{}
	}
	return domain.Project{
		Slug:              p.GetSlug(),
		Title:             p.GetTitle(),
		Subtitle:          p.GetSubtitle(),
		Description:       p.GetDescription(),
		SourceObjPath:     p.GetSourceObjPath(),
		SourceMtlPath:     p.GetSourceMtlPath(),
		SourceTexturePath: p.GetSourceTexturePath(),
		CreatedAt:         p.GetCreatedAt().AsTime(),
		UpdatedAt:         p.GetUpdatedAt().AsTime(),
	}
}

func artifactFromProto(a *catalogv1.Artifact) domain.Artifact {
	if a == nil {
		return domain.Artifact{}
	}
	return domain.Artifact{
		ProjectSlug: a.GetProjectSlug(),
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

func placementFromProto(p *catalogv1.Placement) domain.Placement {
	if p == nil {
		return domain.Placement{}
	}
	return domain.Placement{
		ID:         p.GetId(),
		ParentSlug: p.GetParentSlug(),
		AssetSlug:  p.GetAssetSlug(),
		Position:   vec3FromProto(p.GetPosition()),
		Rotation:   vec3FromProto(p.GetRotation()),
		Scale:      vec3FromProto(p.GetScale()),
		Label:      p.GetLabel(),
		CreatedAt:  p.GetCreatedAt().AsTime(),
		UpdatedAt:  p.GetUpdatedAt().AsTime(),
	}
}
