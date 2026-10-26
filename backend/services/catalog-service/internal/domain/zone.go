package domain

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// ErrZoneNotFound also covers a zone of another territory: the caller only
// ever names the one in its URL.
var ErrZoneNotFound = errors.New("zone not found")

const (
	maxZoneTitle = 120
	maxZoneTags  = 5
)

// Zone is a named rectangle in a territory's normalised scene space (the
// space measurements use). It carries 1–5 tags, never ungrouped. The drawing
// size is nil when the drawing's scale is unknown.
type Zone struct {
	ID             int64
	Title          string
	Corners        [4]Vec3
	Tags           []ModelTag
	DrawingWidthM  *float64
	DrawingHeightM *float64
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// ZoneCreate is the body of a new zone; tags are named by slug.
type ZoneCreate struct {
	Title          string
	Corners        [4]Vec3
	TagSlugs       []string
	DrawingWidthM  *float64
	DrawingHeightM *float64
}

// ZonePatch edits a zone's title and tags, nothing else: geometry is never
// edited (delete and redraw). A nil Title keeps the stored one; Tags are
// replaced only when SetTags is true, because an empty slice cannot say
// "absent".
type ZonePatch struct {
	Title    *string
	TagSlugs []string
	SetTags  bool
}

// Validate checks a new zone and returns a copy with the title trimmed.
func (z ZoneCreate) Validate() (ZoneCreate, error) {
	title, err := TrimZoneTitle(z.Title)
	if err != nil {
		return ZoneCreate{}, err
	}
	z.Title = title
	for i, c := range z.Corners {
		if !isFinite(c.X) || !isFinite(c.Y) || !isFinite(c.Z) {
			return ZoneCreate{}, fmt.Errorf("%w: corner %d is not finite", ErrInvalidInput, i)
		}
	}
	if err := ValidateZoneTags(z.TagSlugs); err != nil {
		return ZoneCreate{}, err
	}
	for _, size := range []*float64{z.DrawingWidthM, z.DrawingHeightM} {
		if size != nil && (!isFinite(*size) || *size <= 0) {
			return ZoneCreate{}, fmt.Errorf("%w: a drawing size must be positive", ErrInvalidInput)
		}
	}
	return z, nil
}

// TrimZoneTitle trims title and refuses it unless 1 to 120 characters remain.
func TrimZoneTitle(title string) (string, error) {
	t := strings.TrimSpace(title)
	if n := utf8.RuneCountInString(t); n == 0 || n > maxZoneTitle {
		return "", fmt.Errorf("%w: a zone title is 1 to %d characters, got %d", ErrInvalidInput, maxZoneTitle, n)
	}
	return t, nil
}

// ValidateZoneTags refuses a tag list a zone may not carry: not 1–5 long, a
// repeat, or the catch-all ungrouped tag (its models would then appear in no
// zone list anyway).
func ValidateZoneTags(slugs []string) error {
	if len(slugs) == 0 || len(slugs) > maxZoneTags {
		return fmt.Errorf("%w: a zone needs 1–%d tags", ErrInvalidInput, maxZoneTags)
	}
	if slices.Contains(slugs, UngroupedTagSlug) {
		return fmt.Errorf("%w: %s cannot be put on a zone", ErrInvalidInput, UngroupedTagSlug)
	}
	sorted := slices.Sorted(slices.Values(slugs))
	if len(slices.Compact(sorted)) != len(sorted) {
		return fmt.Errorf("%w: duplicate tag", ErrInvalidInput)
	}
	return nil
}

func isFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
