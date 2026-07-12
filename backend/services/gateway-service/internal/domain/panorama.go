package domain

import "time"

// Panorama is an equirectangular image (Insta360 Pro source) anchored to a
// point in a territory's normalized scene-units space. The viewer's
// "panorama mode" teleports the camera to Position and renders an inverted
// sphere skybox around it; placements stay shared with the 3D view so
// equipment positioned in either mode is visible from the other.
//
// SourceBlobHash is the BlobStore key for the equirect image; the
// frontend fetches it through /api/assets/{hash}.
type Panorama struct {
	ID             int64
	TerritorySlug  string
	Slug           string
	Title          string
	SourceBlobHash string
	Position       Vec3
	YawOffset      float64
	DefaultYaw     float64
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
