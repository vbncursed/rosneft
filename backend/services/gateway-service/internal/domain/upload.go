package domain

// UploadSession mirrors the upload-service session for the frontend.
type UploadSession struct {
	ID          string
	Size        int64
	Offset      int64
	ContentType string
}

// FinalizedBlob is what /api/uploads/{id}/finalize returns.
type FinalizedBlob struct {
	Hash string
	Size int64
}
