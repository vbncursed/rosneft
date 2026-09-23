package domain

import "time"

// Panorama is an equirectangular image (Insta360 Pro source) anchored to
// a point in a territory's normalized scene-units space. The viewer can
// switch into a "panorama mode" that teleports the camera to Position
// and renders an inverted sphere skybox around it. Placements stay
// identical between 3D and panorama mode — same FK to the same territory,
// same scene-units coordinates — so equipment positioned in either mode
// is visible from the other.
//
// YawOffset rotates the sphere around its Y axis to align the panorama's
// implicit "north" with the territory's axes (manual calibration; cameras
// don't capture magnetic north).
//
// SourceBlobHash is the BlobStore key for the equirect JPG/PNG; the
// frontend fetches it through the asset service at /api/assets/{hash}.
//
// ThumbnailBlobHash is the 256×128 JPEG internal/thumbnail made from the
// source. It is empty until one has been made (a create-time failure, or a row
// older than the column); the startup backfill fills it.
type Panorama struct {
	ID                int64
	TerritorySlug     string
	Slug              string
	Title             string
	SourceBlobHash    string
	Position          Vec3
	YawOffset         float64
	DefaultYaw        float64
	CreatedAt         time.Time
	UpdatedAt         time.Time
	ThumbnailBlobHash string
}
