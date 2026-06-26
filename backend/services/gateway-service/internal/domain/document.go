package domain

import "time"

// Document is a PDF attached to a territory. No scene position, no slug; its
// bytes are served from BlobStore via /api/assets/{SourceBlobHash}.
type Document struct {
	ID             int64
	TerritorySlug  string
	Title          string
	SourceBlobHash string
	CreatedAt      time.Time
}
