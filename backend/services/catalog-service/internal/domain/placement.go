package domain

import "time"

// Placement is one positioned instance of a child project (the asset) on a
// parent project's scene. Both Parent and Asset reference existing projects
// in the catalog; the transform locates the asset within the parent's
// already-normalized coordinate space (centered, max-dim = 2 — see
// converter.normalize).
//
// Position is in scene units. Rotation is Euler XYZ in radians (matches
// Three.js's THREE.Euler default order). Scale is per-axis to support
// non-uniform stretching.
type Placement struct {
	ID         int64
	ParentSlug string
	AssetSlug  string
	Position   Vec3
	Rotation   Vec3
	Scale      Vec3
	Label      string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
