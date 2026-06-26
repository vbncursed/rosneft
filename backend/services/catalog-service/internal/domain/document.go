package domain

import "time"

// Document is a PDF attached to a territory. It has no scene position and no
// slug — it is identified by ID and its bytes are served from BlobStore via
// the asset service at /api/assets/{SourceBlobHash}.
type Document struct {
	ID             int64
	TerritorySlug  string
	Title          string
	SourceBlobHash string
	CreatedAt      time.Time
}
