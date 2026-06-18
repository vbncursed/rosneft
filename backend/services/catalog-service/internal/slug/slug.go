// Package slug derives URL-safe slugs from human titles. Cyrillic is
// transliterated to Latin so Russian titles produce readable slugs rather
// than collapsing to the fallback. Slug uniqueness is the storage layer's
// job; this package only proposes a base and its numbered candidates.
package slug

import (
	"fmt"
	"strings"
	"unicode"
)

// translit maps lowercase Cyrillic runes to their Latin equivalents. The
// hard and soft signs map to nothing; everything else follows common
// BGN/PCGN-style transliteration.
var translit = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "yo",
	'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m",
	'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
	'ф': "f", 'х': "kh", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "shch",
	'ъ': "", 'ы': "y", 'ь': "", 'э': "e", 'ю': "yu", 'я': "ya",
}

// Generate builds a base slug from title: transliterate Cyrillic, lowercase,
// collapse every run of non `[a-z0-9]` into a single hyphen, and trim. When
// the result is empty (e.g. a title made only of punctuation or an unhandled
// script), fallback is returned instead.
func Generate(title, fallback string) string {
	var b strings.Builder
	pendingSep := false
	for _, r := range title {
		r = unicode.ToLower(r)
		if rep, ok := translit[r]; ok {
			b.WriteString(rep)
			pendingSep = false
			continue
		}
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
			pendingSep = false
			continue
		}
		if !pendingSep && b.Len() > 0 {
			b.WriteByte('-')
			pendingSep = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return fallback
	}
	return out
}

// Candidate returns the nth slug to try for a base. The first attempt is the
// base itself; later attempts append a numeric suffix (base-2, base-3, …).
func Candidate(base string, attempt int) string {
	if attempt <= 1 {
		return base
	}
	return fmt.Sprintf("%s-%d", base, attempt)
}
