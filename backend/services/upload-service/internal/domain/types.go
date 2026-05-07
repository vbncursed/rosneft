// Package domain holds the upload-service data model. Pure Go types — no
// proto, no filesystem, no gRPC — so the service layer can be tested
// without infrastructure.
package domain

import "time"

// Session represents one in-progress upload. Bytes are written to a
// per-session temp file under the incoming dir; on Finalize the file is
// hashed, moved into BlobStore as a content-addressed blob, and the
// session is removed.
type Session struct {
	ID          string
	Size        int64 // expected total size
	Offset      int64 // bytes written so far
	ContentType string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// FinalizedBlob is what Finalize returns once a session's bytes have been
// hashed and moved into BlobStore.
type FinalizedBlob struct {
	Hash string
	Size int64
}
