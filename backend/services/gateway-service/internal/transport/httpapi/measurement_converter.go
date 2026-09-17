package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// measurementsToAPI always returns a slice, never nil: the list is required
// in the bundle and an empty territory must serialise as [].
func measurementsToAPI(in []domain.Measurement) []Measurement {
	out := make([]Measurement, len(in))
	for i, m := range in {
		out[i] = measurementToAPI(m)
	}
	return out
}

func measurementToAPI(m domain.Measurement) Measurement {
	points := make([]Vec3, len(m.Points))
	for i, p := range m.Points {
		points[i] = vec3ToAPI(p)
	}
	return Measurement{
		Id:            m.ID,
		TerritorySlug: m.TerritorySlug,
		Points:        points,
		Closed:        m.Closed,
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}
}

// measurementFromAPI takes slug and id from the URL, never from the body: the
// territory gate authorised the URL's slug.
func measurementFromAPI(slug string, id int64, body MeasurementWrite) domain.Measurement {
	points := make([]domain.Vec3, len(body.Points))
	for i, p := range body.Points {
		points[i] = vec3FromAPI(p)
	}
	return domain.Measurement{ID: id, TerritorySlug: slug, Points: points, Closed: body.Closed}
}
