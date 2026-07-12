package content

import (
	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func vec3FromProto(v *contentv1.Vec3) domain.Vec3 {
	if v == nil {
		return domain.Vec3{}
	}
	return domain.Vec3{X: v.GetX(), Y: v.GetY(), Z: v.GetZ()}
}

func vec3ToProto(v domain.Vec3) *contentv1.Vec3 {
	return &contentv1.Vec3{X: v.X, Y: v.Y, Z: v.Z}
}

func panoramaFromProto(p *contentv1.Panorama) domain.Panorama {
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
		DefaultYaw:     p.GetDefaultYaw(),
		CreatedAt:      p.GetCreatedAt().AsTime(),
		UpdatedAt:      p.GetUpdatedAt().AsTime(),
	}
}

func documentFromProto(d *contentv1.Document) domain.Document {
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
