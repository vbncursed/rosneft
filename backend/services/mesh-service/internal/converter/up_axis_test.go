package converter

import (
	"testing"

	"gotest.tools/v3/assert"
)

func TestZUpSource(t *testing.T) {
	tests := []struct {
		name     string
		min, max vertex
		want     bool
	}{
		{"DJI photogrammetry, Z thinnest", vertex{0, 0, 0}, vertex{444, 664, 57.9}, true},
		{"SketchUp territory, Y thinnest", vertex{0, 0, 0}, vertex{38.65, 31.04, 43.17}, false},
		{"flat Y-thin terrain", vertex{0, 0, 0}, vertex{500, 3, 400}, false},
		{"tall object, Y largest", vertex{0, 0, 0}, vertex{10, 50, 12}, true},
		{"X and Y tie for thinnest", vertex{0, 0, 0}, vertex{5, 5, 9}, true},
		{"Y and Z tie for thinnest", vertex{0, 0, 0}, vertex{9, 5, 5}, true},
		{"all equal", vertex{0, 0, 0}, vertex{4, 4, 4}, true},
		{"offset origin does not matter", vertex{100, -50, 7}, vertex{110, -49, 17}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, zUpSource(tt.min, tt.max), tt.want)
		})
	}
}

func TestSwapZUpToYUp(t *testing.T) {
	ps := []vertex{{1, 2, 3}, {-4, 5, 0}}
	swapZUpToYUp(ps)
	assert.DeepEqual(t, ps, []vertex{{1, 3, -2}, {-4, 0, -5}})
}
