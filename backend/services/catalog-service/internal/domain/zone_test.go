package domain_test

import (
	"math"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

type ZoneSuite struct {
	suite.Suite
}

func TestZoneSuite(t *testing.T) { suite.Run(t, new(ZoneSuite)) }

var unitSquare = [4]domain.Vec3{{X: 0, Z: 0}, {X: 1, Z: 0}, {X: 1, Z: 1}, {X: 0, Z: 1}}

func validZone() domain.ZoneCreate {
	return domain.ZoneCreate{Title: "N2 Area", Corners: unitSquare, TagSlugs: []string{"nitrogen"}}
}

func (s *ZoneSuite) TestZoneCreateValidate() {
	tests := []struct {
		name    string
		mutate  func(z *domain.ZoneCreate)
		wantMsg string // empty: valid
	}{
		{"valid", func(*domain.ZoneCreate) {}, ""},
		{"NaN corner", func(z *domain.ZoneCreate) { z.Corners[2].Y = math.NaN() }, "corner 2 is not finite"},
		{"+Inf corner", func(z *domain.ZoneCreate) { z.Corners[0].X = math.Inf(1) }, "corner 0 is not finite"},
		{"-Inf corner", func(z *domain.ZoneCreate) { z.Corners[3].Z = math.Inf(-1) }, "corner 3 is not finite"},
		{"blank title", func(z *domain.ZoneCreate) { z.Title = "  " }, "a zone title is 1 to 120 characters"},
		{"121 runes", func(z *domain.ZoneCreate) { z.Title = strings.Repeat("я", 121) }, "a zone title is 1 to 120 characters"},
		{"120 runes", func(z *domain.ZoneCreate) { z.Title = strings.Repeat("я", 120) }, ""},
		{"no tags", func(z *domain.ZoneCreate) { z.TagSlugs = []string{} }, "a zone needs 1–5 tags"},
		{"nil tags", func(z *domain.ZoneCreate) { z.TagSlugs = nil }, "a zone needs 1–5 tags"},
		{"six tags", func(z *domain.ZoneCreate) { z.TagSlugs = []string{"a", "b", "c", "d", "e", "f"} }, "a zone needs 1–5 tags"},
		{"five tags", func(z *domain.ZoneCreate) { z.TagSlugs = []string{"a", "b", "c", "d", "e"} }, ""},
		{"duplicate tag", func(z *domain.ZoneCreate) { z.TagSlugs = []string{"camp", "camp"} }, "duplicate tag"},
		{"ungrouped", func(z *domain.ZoneCreate) { z.TagSlugs = []string{"ungrouped"} }, "ungrouped cannot be put on a zone"},
		{"zero width", func(z *domain.ZoneCreate) { z.DrawingWidthM = new(0.0) }, "drawing size must be positive"},
		{"negative height", func(z *domain.ZoneCreate) { z.DrawingHeightM = new(-1.0) }, "drawing size must be positive"},
		{"NaN width", func(z *domain.ZoneCreate) { z.DrawingWidthM = new(math.NaN()) }, "drawing size must be positive"},
		{"sized", func(z *domain.ZoneCreate) { z.DrawingWidthM, z.DrawingHeightM = new(7.5), new(13.0) }, ""},
	}
	for _, tc := range tests {
		s.Run(tc.name, func() {
			z := validZone()
			tc.mutate(&z)
			_, err := z.Validate()
			if tc.wantMsg == "" {
				assert.NilError(s.T(), err)
				return
			}
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
			assert.ErrorContains(s.T(), err, tc.wantMsg)
		})
	}
}

func (s *ZoneSuite) TestValidateTrimsTheTitleOnACopy() {
	z := validZone()
	z.Title = "  N2 Area "
	got, err := z.Validate()
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "N2 Area")
	assert.Equal(s.T(), z.Title, "  N2 Area ")
}

func (s *ZoneSuite) TestValidateZoneTagsAlone() {
	assert.NilError(s.T(), domain.ValidateZoneTags([]string{"camp", "power"}))
	assert.ErrorContains(s.T(), domain.ValidateZoneTags(nil), "a zone needs 1–5 tags")
}
