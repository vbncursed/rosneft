package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListMeasurements returns every saved measurement on the territory.
func (c *Client) ListMeasurements(ctx context.Context, territorySlug string) ([]domain.Measurement, error) {
	resp, err := c.cc.ListMeasurements(ctx, &catalogv1.ListMeasurementsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListMeasurements: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Measurement, len(resp.GetMeasurements()))
	for i, m := range resp.GetMeasurements() {
		out[i] = measurementFromProto(m)
	}
	return out, nil
}

// CreateMeasurement saves a chain on m.TerritorySlug. The author is not sent:
// catalog records it from the actor metadata.
func (c *Client) CreateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	resp, err := c.cc.CreateMeasurement(ctx, &catalogv1.CreateMeasurementRequest{
		TerritorySlug: m.TerritorySlug,
		Points:        flattenPoints(m.Points),
		Closed:        m.Closed,
	})
	if err != nil {
		return domain.Measurement{}, fmt.Errorf("catalog.CreateMeasurement: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return measurementFromProto(resp.GetMeasurement()), nil
}

// UpdateMeasurement replaces the points and closed flag of measurement m.ID on
// m.TerritorySlug.
func (c *Client) UpdateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	resp, err := c.cc.UpdateMeasurement(ctx, &catalogv1.UpdateMeasurementRequest{
		TerritorySlug: m.TerritorySlug,
		Id:            m.ID,
		Points:        flattenPoints(m.Points),
		Closed:        m.Closed,
	})
	if err != nil {
		return domain.Measurement{}, fmt.Errorf("catalog.UpdateMeasurement: %w", grpcerr.MapStatus(err, domain.ErrMeasurementNotFound))
	}
	return measurementFromProto(resp.GetMeasurement()), nil
}

// DeleteMeasurement removes measurement id on territorySlug.
func (c *Client) DeleteMeasurement(ctx context.Context, territorySlug string, id int64) error {
	_, err := c.cc.DeleteMeasurement(ctx, &catalogv1.DeleteMeasurementRequest{TerritorySlug: territorySlug, Id: id})
	if err != nil {
		return fmt.Errorf("catalog.DeleteMeasurement: %w", grpcerr.MapStatus(err, domain.ErrMeasurementNotFound))
	}
	return nil
}

// DeleteMeasurements removes every measurement on territorySlug and returns how
// many there were.
func (c *Client) DeleteMeasurements(ctx context.Context, territorySlug string) (int, error) {
	resp, err := c.cc.DeleteMeasurements(ctx, &catalogv1.DeleteMeasurementsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return 0, fmt.Errorf("catalog.DeleteMeasurements: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return int(resp.GetDeleted()), nil
}

func measurementFromProto(m *catalogv1.Measurement) domain.Measurement {
	if m == nil {
		return domain.Measurement{}
	}
	return domain.Measurement{
		ID:            m.GetId(),
		TerritorySlug: m.GetTerritorySlug(),
		Points:        pointsFromFlat(m.GetPoints()),
		Closed:        m.GetClosed(),
		CreatedAt:     m.GetCreatedAt().AsTime(),
		UpdatedAt:     m.GetUpdatedAt().AsTime(),
	}
}

// flattenPoints lays the chain out as the RPC carries it: x0,y0,z0,x1,….
func flattenPoints(points []domain.Vec3) []float64 {
	out := make([]float64, 0, len(points)*3)
	for _, p := range points {
		out = append(out, p.X, p.Y, p.Z)
	}
	return out
}

// pointsFromFlat is flattenPoints' inverse. A partial trailing triple is
// dropped rather than padded: catalog's check constraint keeps the length a
// multiple of three, and a padded point would be a phantom vertex at the origin.
func pointsFromFlat(flat []float64) []domain.Vec3 {
	out := make([]domain.Vec3, len(flat)/3)
	for i := range out {
		out[i] = domain.Vec3{X: flat[3*i], Y: flat[3*i+1], Z: flat[3*i+2]}
	}
	return out
}
