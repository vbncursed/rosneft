// Package domain contains the content service's data model: documents and
// panoramas anchored to a territory. Pure Go types — no proto, no SQL.
package domain

// Vec3 is a point in the territory's normalized scene-units space.
type Vec3 struct {
	X, Y, Z float64
}
