package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// loadCalibrations reads every point of the given documents in one query and
// returns each calibrated document's calibration by id. Documents without
// points are absent from the map.
func (r *PG) loadCalibrations(ctx context.Context, documentIDs []int64) (map[int64]*domain.Calibration, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT document_id, page, pdf_x, pdf_y, scene_x, scene_y, scene_z, utm_e, utm_n
		FROM document_calibration_points
		WHERE document_id = ANY($1)
		ORDER BY document_id, idx`, documentIDs)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	out := make(map[int64]*domain.Calibration)
	for rows.Next() {
		var (
			docID, page int64
			p           domain.CalibrationPoint
			utmE, utmN  *float64
		)
		if err := rows.Scan(&docID, &page, &p.PDFX, &p.PDFY, &p.Scene.X, &p.Scene.Y, &p.Scene.Z, &utmE, &utmN); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		if utmE != nil && utmN != nil {
			p.UTM = &domain.UTM{E: *utmE, N: *utmN}
		}
		c := out[docID]
		if c == nil {
			c = &domain.Calibration{Page: int(page)}
			out[docID] = c
		}
		c.Points = append(c.Points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iter: %w", err)
	}
	return out, nil
}
