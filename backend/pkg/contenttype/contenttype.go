// Package contenttype is the one place an upload's declared Content-Type is
// reduced to a value safe to store and replay when the blob is served.
package contenttype

import "mime"

// allowedContentTypes is what a client may have stored for its upload. The
// type is replayed as Content-Type when the blob is served from the app
// origin, so anything that can render (text/html, image/svg+xml) is not on it.
var allowedContentTypes = map[string]bool{
	"application/zip":              true,
	"application/x-zip-compressed": true, // Windows browsers
	"model/gltf-binary":            true,
	"model/gltf+json":              true,
	"image/jpeg":                   true,
	"image/png":                    true,
	"image/webp":                   true,
	"application/pdf":              true,
	"application/octet-stream":     true,
}

const fallbackContentType = "application/octet-stream"

// Normalise lower-cases the type, drops its parameters and maps
// anything off the allow-list (including empty or unparsable) to
// application/octet-stream. It never rejects: an upload that worked keeps working.
func Normalise(raw string) string {
	mediaType, _, err := mime.ParseMediaType(raw)
	if err != nil || !allowedContentTypes[mediaType] {
		return fallbackContentType
	}
	return mediaType
}
