package roles

import (
	"testing"

	"gotest.tools/v3/assert"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Company Owner":   "company-owner",
		"  Spaced  Out  ": "spaced-out",
		"Trail---dashes!": "trail-dashes",
		"R2D2":            "r2d2",
		"Менеджер":        "", // non-ASCII collapses to empty; caller falls back to "role"
	}
	for in, want := range cases {
		assert.Equal(t, slugify(in), want)
	}
}
