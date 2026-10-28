package domain_test

import (
	"math"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

func points(n int) []domain.CalibrationPoint {
	out := make([]domain.CalibrationPoint, n)
	for i := range out {
		out[i] = domain.CalibrationPoint{PDFX: float64(i), PDFY: 1, Scene: domain.Vec3{X: 1, Y: 2, Z: 3}}
	}
	return out
}

func TestCalibrationValidate(t *testing.T) {
	nan, inf := math.NaN(), math.Inf(1)
	withPoint := func(mut func(*domain.CalibrationPoint)) domain.Calibration {
		pts := points(2)
		mut(&pts[1])
		return domain.Calibration{Page: 1, Points: pts}
	}
	tests := []struct {
		name    string
		c       domain.Calibration
		wantErr string
	}{
		{name: "two points without utm", c: domain.Calibration{Page: 1, Points: points(2)}},
		{name: "twenty points", c: domain.Calibration{Page: 32767, Points: points(20)}},
		{
			name:    "one point",
			c:       domain.Calibration{Page: 1, Points: points(1)},
			wantErr: "a calibration needs 2–20 points",
		},
		{
			name:    "twenty-one points",
			c:       domain.Calibration{Page: 1, Points: points(21)},
			wantErr: "a calibration needs 2–20 points",
		},
		{name: "page zero", c: domain.Calibration{Page: 0, Points: points(2)}, wantErr: "page"},
		{name: "page above smallint", c: domain.Calibration{Page: 32768, Points: points(2)}, wantErr: "page"},
		{name: "nan pdf x", c: withPoint(func(p *domain.CalibrationPoint) { p.PDFX = nan }), wantErr: "finite"},
		{name: "inf pdf y", c: withPoint(func(p *domain.CalibrationPoint) { p.PDFY = inf }), wantErr: "finite"},
		{name: "nan scene z", c: withPoint(func(p *domain.CalibrationPoint) { p.Scene.Z = nan }), wantErr: "finite"},
		{
			name:    "nan utm",
			c:       withPoint(func(p *domain.CalibrationPoint) { p.UTM = &domain.UTM{E: nan, N: 1} }),
			wantErr: "finite",
		},
		{name: "finite utm", c: withPoint(func(p *domain.CalibrationPoint) { p.UTM = &domain.UTM{E: 5, N: 6} })},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.c.Validate()
			if tt.wantErr == "" {
				assert.NilError(t, err)
				return
			}
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.ErrorContains(t, err, tt.wantErr)
		})
	}
}
