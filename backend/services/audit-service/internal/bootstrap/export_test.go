package bootstrap

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ExportSuite struct {
	suite.Suite
}

func TestExportSuite(t *testing.T) {
	suite.Run(t, new(ExportSuite))
}

func (s *ExportSuite) TestParseCutoff() {
	local := time.FixedZone("test-local", 5*60*60)
	previous := time.Local
	time.Local = local
	s.T().Cleanup(func() { time.Local = previous })

	valid := []struct {
		name  string
		input string
		want  time.Time
	}{
		{"UTC", "2024-03-01T12:34:56Z", time.Date(2024, 3, 1, 12, 34, 56, 0, time.UTC)},
		{"offset", "2024-03-01T12:34:56+03:30", time.Date(2024, 3, 1, 12, 34, 56, 0, time.FixedZone("", 3*3600+30*60))},
		{
			"fractional seconds",
			"2024-03-01T12:34:56.123456789Z",
			time.Date(2024, 3, 1, 12, 34, 56, 123456789, time.UTC),
		},
		{"local date", "2024-03-01", time.Date(2024, 3, 1, 0, 0, 0, 0, local)},
		{"leap day", "2024-02-29", time.Date(2024, 2, 29, 0, 0, 0, 0, local)},
		{"zero time", "0001-01-01T00:00:00Z", time.Time{}},
	}
	for _, tc := range valid {
		s.Run(tc.name, func() {
			got, err := parseCutoff(tc.input)
			assert.NilError(s.T(), err)
			assert.Assert(s.T(), got.Equal(tc.want), "got %v, want %v", got, tc.want)
			_, gotOffset := got.Zone()
			_, wantOffset := tc.want.Zone()
			assert.Equal(s.T(), gotOffset, wantOffset)
			if tc.name == "local date" || tc.name == "leap day" {
				assert.Assert(s.T(), got.Location() == local)
			}
		})
	}

	invalid := []struct{ name, input string }{
		{"invalid date", "2023-02-29"},
		{"empty", ""},
		{"missing timezone", "2024-03-01T12:34:56"},
		{"leading space", " 2024-03-01"},
		{"trailing space", "2024-03-01 "},
		{"invalid timestamp", "not a date"},
	}
	for _, tc := range invalid {
		s.Run(tc.name, func() {
			got, err := parseCutoff(tc.input)
			assert.Assert(s.T(), err != nil)
			assert.Equal(
				s.T(),
				err.Error(),
				fmt.Sprintf("export: --before must be RFC3339 or YYYY-MM-DD, got %q", tc.input),
			)
			assert.Equal(s.T(), got, time.Time{})
		})
	}
}
