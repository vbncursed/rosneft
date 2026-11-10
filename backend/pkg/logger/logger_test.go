package logger_test

import (
	"bytes"
	"encoding/json/v2"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"github.com/vbncursed/rosneft/backend/pkg/logger"
	"gotest.tools/v3/assert"
)

type LoggerSuite struct {
	suite.Suite
}

func TestLoggerSuite(t *testing.T) {
	suite.Run(t, new(LoggerSuite))
}

func (s *LoggerSuite) TestNewLevels() {
	for _, tc := range []struct {
		name  string
		level string
		min   slog.Level
	}{
		{"debug", "debug", slog.LevelDebug},
		{"info", "info", slog.LevelInfo},
		{"warn", "warn", slog.LevelWarn},
		{"warning", "warning", slog.LevelWarn},
		{"error", "error", slog.LevelError},
		{"empty", "", slog.LevelInfo},
		{"unknown", "unexpected", slog.LevelInfo},
		{"case insensitive", "DeBuG", slog.LevelDebug},
	} {
		s.Run(tc.name, func() {
			t := s.T()
			var out bytes.Buffer
			log := logger.New(&out, logger.Config{Level: tc.level})
			for _, level := range []slog.Level{slog.LevelDebug, slog.LevelInfo, slog.LevelWarn, slog.LevelError} {
				assert.Equal(t, log.Enabled(t.Context(), level), level >= tc.min)
			}
			log.Debug("debug message")
			log.Error("error message")
			assert.Equal(t, strings.Contains(out.String(), "debug message"), tc.min == slog.LevelDebug)
			assert.Assert(t, strings.Contains(out.String(), "error message"))
		})
	}
}

func (s *LoggerSuite) TestNewFormatAndSource() {
	for _, tc := range []struct {
		name, format string
		json, source bool
	}{
		{"default JSON", "", true, false},
		{"explicit JSON with source", "json", true, true},
		{"unknown format", "other", true, false},
		{"text", "text", false, false},
		{"case insensitive text with source", "TeXt", false, true},
	} {
		s.Run(tc.name, func() {
			t := s.T()
			var out bytes.Buffer
			log := logger.New(&out, logger.Config{Format: tc.format, AddSource: tc.source})
			log.Info("hello", "service", "catalog")
			if tc.json {
				var record map[string]any
				assert.NilError(t, json.Unmarshal(out.Bytes(), &record))
				assert.Equal(t, record["level"], any("INFO"))
				assert.Equal(t, record["msg"], any("hello"))
				assert.Equal(t, record["service"], any("catalog"))
				_, hasSource := record["source"]
				assert.Equal(t, hasSource, tc.source)
				if tc.source {
					source, ok := record["source"].(map[string]any)
					assert.Assert(t, ok)
					assert.Assert(t, strings.HasSuffix(source["file"].(string), "logger_test.go"))
				}
			} else {
				assert.Assert(t, strings.Contains(out.String(), "level=INFO"))
				assert.Assert(t, strings.Contains(out.String(), "msg=hello"))
				assert.Assert(t, strings.Contains(out.String(), "service=catalog"))
				assert.Equal(t, strings.Contains(out.String(), "source="), tc.source)
				if tc.source {
					assert.Assert(t, strings.Contains(out.String(), "logger_test.go:"))
				}
			}
		})
	}
}
