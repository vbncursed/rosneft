package domain

import (
	"fmt"
	"math"
)

const (
	minCalibrationPoints = 2
	maxCalibrationPoints = 20
	maxCalibrationPage   = math.MaxInt16 // the page column is a SMALLINT
)

// UTM is a point's easting/northing in metres.
type UTM struct{ E, N float64 }

// CalibrationPoint pairs a point on the PDF page (pt, top-left origin, y
// down) with a point in the territory's scene space, optionally with its UTM.
type CalibrationPoint struct {
	PDFX, PDFY float64
	Scene      Vec3
	UTM        *UTM
}

// Calibration is a document's point pairs, all on one 1-based page.
type Calibration struct {
	Page   int
	Points []CalibrationPoint
}

// Validate refuses a page outside 1..32767, a point count outside 2..20 and
// any coordinate that is not a finite number.
func (c Calibration) Validate() error {
	if c.Page < 1 || c.Page > maxCalibrationPage {
		return fmt.Errorf("%w: calibration page must be 1 to %d, got %d", ErrInvalidInput, maxCalibrationPage, c.Page)
	}
	if n := len(c.Points); n < minCalibrationPoints || n > maxCalibrationPoints {
		return fmt.Errorf("%w: a calibration needs %d–%d points", ErrInvalidInput, minCalibrationPoints, maxCalibrationPoints)
	}
	for i, p := range c.Points {
		if !p.finite() {
			return fmt.Errorf("%w: calibration point %d has a coordinate that is not finite", ErrInvalidInput, i)
		}
	}
	return nil
}

func (p CalibrationPoint) finite() bool {
	vals := []float64{p.PDFX, p.PDFY, p.Scene.X, p.Scene.Y, p.Scene.Z}
	if p.UTM != nil {
		vals = append(vals, p.UTM.E, p.UTM.N)
	}
	for _, v := range vals {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return true
}
