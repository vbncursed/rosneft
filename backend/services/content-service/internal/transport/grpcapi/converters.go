package grpcapi

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

func vec3ToProto(v domain.Vec3) *contentv1.Vec3 {
	return &contentv1.Vec3{X: v.X, Y: v.Y, Z: v.Z}
}

func vec3FromProto(v *contentv1.Vec3) domain.Vec3 {
	if v == nil {
		return domain.Vec3{}
	}
	return domain.Vec3{X: v.GetX(), Y: v.GetY(), Z: v.GetZ()}
}

func panoramaToProto(p domain.Panorama) *contentv1.Panorama {
	return &contentv1.Panorama{
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

func documentToProto(d domain.Document) *contentv1.Document {
	return &contentv1.Document{
		Id:             d.ID,
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
		CreatedAt:      timestamppb.New(d.CreatedAt),
	}
}
