package domain

import "time"

// Placement is one instance of a model overlaid on a territory at a specific
// transform. The territory provides the parent canvas (already normalized to
// max-axis = 2 by the converter); the placement positions the model within
// that coordinate space.
//
// Position is in scene units. Rotation is Euler XYZ in radians (matches
// Three.js's THREE.Euler default order). Scale is per-axis to support
// non-uniform stretching.
type Placement struct {
	ID            int64
	TerritorySlug string
	ModelSlug     string
	Position      Vec3
	Rotation      Vec3
	Scale         Vec3
	Label         string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	// VisiblePanoramaIDs is the allowlist of panoramas this placement shows
	// in (panorama mode only; the 3D view always shows every placement).
	// Empty means hidden in every panorama.
	VisiblePanoramaIDs []int64
	// PanoramaLabels are per-panorama names (independent of visibility).
	PanoramaLabels []PanoramaLabel
}

// PanoramaLabel is a placement's name within one panorama.
type PanoramaLabel struct {
	PanoramaID int64
	Label      string
}
