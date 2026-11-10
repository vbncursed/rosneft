package thumbnail

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type JPEGProgressiveSuite struct{ suite.Suite }

func TestJPEGProgressiveSuite(t *testing.T) { suite.Run(t, new(JPEGProgressiveSuite)) }

func (s *JPEGProgressiveSuite) TestMarkers() {
	for _, tc := range []struct {
		name string
		head []byte
		want bool
	}{
		{"baseline SOF0", []byte{0xff, 0xd8, 0xff, 0xc0}, false},
		{"extended sequential SOF1", []byte{0xff, 0xd8, 0xff, 0xc1}, false},
		{"progressive SOF2", []byte{0xff, 0xd8, 0xff, 0xc2}, true},
		{"APP payload contains SOF2", []byte{0xff, 0xd8, 0xff, 0xe1, 0, 6, 0xff, 0xc2, 0, 0, 0xff, 0xc0}, false},
		{"APP payload contains SOF0 before progressive frame", []byte{0xff, 0xd8, 0xff, 0xe1, 0, 4, 0xff, 0xc0, 0xff, 0xc2}, true},
		{"fill bytes before baseline frame", []byte{0xff, 0xd8, 0xff, 0xff, 0xc0}, false},
		{"extraneous bytes before baseline frame", []byte{0xff, 0xd8, 1, 2, 0xff, 0xc0}, false},
		{"stuffing and restart markers before baseline frame", []byte{0xff, 0xd8, 0xff, 0, 0xff, 0xd0, 0xff, 0xd7, 0xff, 0xc0}, false},
		{"empty header fails expensive", nil, true},
		{"truncated marker length fails expensive", []byte{0xff, 0xd8, 0xff, 0xe1, 0}, true},
		{"segment extends beyond header fails expensive", []byte{0xff, 0xd8, 0xff, 0xe1, 0, 8, 0xff, 0xc0}, true},
		{"no frame fails expensive", []byte{0xff, 0xd8, 0xff, 0xe1, 0, 2}, true},
	} {
		s.Run(tc.name, func() {
			assert.Equal(s.T(), jpegProgressive(tc.head), tc.want)
		})
	}
}
