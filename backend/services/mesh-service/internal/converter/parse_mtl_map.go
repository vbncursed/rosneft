package converter

import (
	"strconv"
	"strings"
)

// mapKdFlagArgs is the argument count for each MTL texture-option flag we
// know about. The list comes from the Wavefront MTL spec — anything not
// listed defaults to 1 argument, which covers the long tail of vendor flags
// gracefully.
var mapKdFlagArgs = map[string]int{
	"-blendu":  1,
	"-blendv":  1,
	"-cc":      1,
	"-clamp":   1,
	"-mm":      2,
	"-o":       3,
	"-s":       3,
	"-t":       3,
	"-texres":  1,
	"-imfchan": 1,
	"-bm":      1,
	"-type":    1,
	"-boost":   1,
}

// mapKdOptionalArgs are the flags whose trailing v and w are optional per the
// MTL spec (`-o u [v [w]]`): the table value is a maximum, and only leading
// numeric tokens count, so `-s 2 2 tex.jpg` keeps its file name.
var mapKdOptionalArgs = map[string]bool{"-o": true, "-s": true, "-t": true}

// stripMapOptions consumes the `-flag value [value...]` prefixes that some
// exporters emit before the texture path on a `map_Kd` line. The remainder
// is returned verbatim — including spaces, which SketchUp exports happily
// embed in directory names.
func stripMapOptions(s string) string {
	for {
		s = trimLeftSpace(s)
		if len(s) == 0 || s[0] != '-' {
			return s
		}
		flag, rest := splitToken(s)
		argc, ok := mapKdFlagArgs[flag]
		if !ok {
			argc = 1
		}
		s = rest
		for range argc {
			s = trimLeftSpace(s)
			tok, after := splitToken(s)
			// The last token is the file name, never an option value.
			if mapKdOptionalArgs[flag] && (!isNumber(tok) || strings.TrimSpace(after) == "") {
				break
			}
			s = after
		}
	}
}

// splitToken returns (firstWhitespaceDelimitedToken, remainder).
func splitToken(s string) (string, string) {
	end := 0
	for end < len(s) && s[end] != ' ' && s[end] != '\t' {
		end++
	}
	return s[:end], s[end:]
}

func trimLeftSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	return s
}

func isNumber(tok string) bool {
	_, err := strconv.ParseFloat(tok, 64)
	return err == nil
}
