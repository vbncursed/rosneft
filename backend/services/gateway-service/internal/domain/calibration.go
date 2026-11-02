package domain

// Vec2 is a point on a PDF page.
type Vec2 struct {
	X, Y float64
}

// UTM is a point's easting and northing in metres.
type UTM struct {
	E, N float64
}

// CalibrationPoint pairs a point on the PDF page with the same point in the
// territory's scene space, and its UTM when known.
type CalibrationPoint struct {
	PDF   Vec2
	Scene Vec3
	UTM   *UTM
}

// Calibration is a document's point pairs, all on one 1-based page.
type Calibration struct {
	Page   int32
	Points []CalibrationPoint
}
