package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func modelTagToAPI(t domain.ModelTag) ModelTag { return ModelTag{Slug: t.Slug, Title: t.Title} }

func modelTagsToAPI(in []domain.ModelTag) []ModelTag {
	out := make([]ModelTag, len(in))
	for i, t := range in {
		out[i] = modelTagToAPI(t)
	}
	return out
}

// zonesToAPI always returns a slice, never nil: the list is required in the
// bundle and a territory without zones must serialise as [].
func zonesToAPI(in []domain.Zone) []Zone {
	out := make([]Zone, len(in))
	for i, z := range in {
		out[i] = zoneToAPI(z)
	}
	return out
}

func zoneToAPI(z domain.Zone) Zone {
	corners := make([]Vec3, len(z.Corners))
	for i, c := range z.Corners {
		corners[i] = vec3ToAPI(c)
	}
	return Zone{
		Id:             z.ID,
		Title:          z.Title,
		Corners:        corners,
		Tags:           modelTagsToAPI(z.Tags),
		DrawingWidthM:  z.DrawingWidthM,
		DrawingHeightM: z.DrawingHeightM,
		CreatedAt:      z.CreatedAt,
		UpdatedAt:      z.UpdatedAt,
	}
}

func zoneCreateFromAPI(body ZoneCreate) domain.ZoneCreate {
	corners := make([]domain.Vec3, len(body.Corners))
	for i, c := range body.Corners {
		corners[i] = vec3FromAPI(c)
	}
	return domain.ZoneCreate{
		Title:          body.Title,
		Corners:        corners,
		TagSlugs:       body.TagSlugs,
		DrawingWidthM:  body.DrawingWidthM,
		DrawingHeightM: body.DrawingHeightM,
	}
}

// zonePatchFromAPI reads tagSlugs as a replacement whenever the key is present,
// even as []: the catalog refuses an empty set rather than the gateway guessing.
func zonePatchFromAPI(body ZonePatch) domain.ZonePatch {
	p := domain.ZonePatch{Title: body.Title}
	if body.TagSlugs != nil {
		p.TagSlugs, p.SetTags = *body.TagSlugs, true
	}
	return p
}
