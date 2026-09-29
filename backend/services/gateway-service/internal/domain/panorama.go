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
//
// ThumbnailBlobHash is content-service's 256×128 JPEG of the source, or empty
// until one has been made.
//
// Phase is one of PanoramaPhases. Hidden is shared by every reader: the map
// draws a panorama only when neither it nor its phase is hidden.
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
	Phase             string
	Hidden            bool
}

// The three fixed phases of a job a panorama can be taken at.
const (
	PhasePrior   = "prior"
	PhaseCurrent = "current"
	PhasePost    = "post"
)

// PanoramaPhases is every phase, in the order the scene bundle lists them.
var PanoramaPhases = []string{PhasePrior, PhaseCurrent, PhasePost}

// PanoramaPhase is one phase's shared hidden flag on a territory.
type PanoramaPhase struct {
	Phase  string
	Hidden bool
}
