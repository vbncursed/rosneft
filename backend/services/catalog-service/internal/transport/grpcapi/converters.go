package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func projectToProto(p domain.Project) *catalogv1.Project {
	return &catalogv1.Project{
		Slug:              p.Slug,
		Title:             p.Title,
		Subtitle:          p.Subtitle,
		Description:       p.Description,
		SourceObjPath:     p.SourceObjPath,
		SourceMtlPath:     p.SourceMtlPath,
		SourceTexturePath: p.SourceTexturePath,
		CreatedAt:         timestamppb.New(p.CreatedAt),
		UpdatedAt:         timestamppb.New(p.UpdatedAt),
	}
}

func projectFromProto(p *catalogv1.Project) domain.Project {
	return domain.Project{
		Slug:              p.GetSlug(),
		Title:             p.GetTitle(),
		Subtitle:          p.GetSubtitle(),
		Description:       p.GetDescription(),
		SourceObjPath:     p.GetSourceObjPath(),
		SourceMtlPath:     p.GetSourceMtlPath(),
		SourceTexturePath: p.GetSourceTexturePath(),
	}
}

func artifactToProto(a domain.Artifact) *catalogv1.Artifact {
	return &catalogv1.Artifact{
		ProjectSlug: a.ProjectSlug,
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

func artifactFromProto(a *catalogv1.Artifact) domain.Artifact {
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
		Id:         p.ID,
		ParentSlug: p.ParentSlug,
		AssetSlug:  p.AssetSlug,
		Position:   vec3ToProto(p.Position),
		Rotation:   vec3ToProto(p.Rotation),
		Scale:      vec3ToProto(p.Scale),
		Label:      p.Label,
		CreatedAt:  timestamppb.New(p.CreatedAt),
		UpdatedAt:  timestamppb.New(p.UpdatedAt),
	}
}
