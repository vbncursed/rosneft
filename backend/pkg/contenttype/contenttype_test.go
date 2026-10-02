package contenttype

import "testing"

func TestNormalise(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"zip", "application/zip", "application/zip"},
		{"windows zip", "application/x-zip-compressed", "application/x-zip-compressed"},
		{"glb", "model/gltf-binary", "model/gltf-binary"},
		{"gltf", "model/gltf+json", "model/gltf+json"},
		{"jpeg", "image/jpeg", "image/jpeg"},
		{"png", "image/png", "image/png"},
		{"webp", "image/webp", "image/webp"},
		{"pdf", "application/pdf", "application/pdf"},
		{"octet-stream", "application/octet-stream", "application/octet-stream"},
		{"upper case with parameter and spaces", "  IMAGE/PNG ; charset=binary ", "image/png"},
		{"html", "text/html", "application/octet-stream"},
		{"html upper case with charset", "TEXT/HTML; charset=utf-8", "application/octet-stream"},
		{"svg", "image/svg+xml", "application/octet-stream"},
		{"javascript", "application/javascript", "application/octet-stream"},
		{"empty", "", "application/octet-stream"},
		{"garbage", ";;;", "application/octet-stream"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Normalise(tt.in); got != tt.want {
				t.Errorf("Normalise(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
