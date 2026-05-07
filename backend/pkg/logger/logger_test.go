package logger_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/logger"
)

type LoggerSuite struct {
	suite.Suite
}

func TestLoggerSuite(t *testing.T) {
	suite.Run(t, new(LoggerSuite))
}

func (s *LoggerSuite) TestNew_writesJSON() {
	var buf bytes.Buffer
	log := logger.New(&buf, logger.Config{Level: "info", Format: "json"})
	log.Info("hello", "key", "value")

	var entry map[string]any
	assert.NilError(s.T(), json.Unmarshal(buf.Bytes(), &entry))
	assert.Equal(s.T(), entry["msg"], "hello")
	assert.Equal(s.T(), entry["key"], "value")
}

func (s *LoggerSuite) TestNew_defaultIsJSON() {
	var buf bytes.Buffer
	log := logger.New(&buf, logger.Config{})
	log.Info("hi")
	assert.Assert(s.T(), json.Valid(buf.Bytes()), "default format should be JSON, got: %q", buf.String())
}

func (s *LoggerSuite) TestNew_writesText() {
	var buf bytes.Buffer
	log := logger.New(&buf, logger.Config{Format: "text"})
	log.Info("hi")
	assert.Assert(s.T(), strings.Contains(buf.String(), "hi"))
	assert.Assert(s.T(), !json.Valid(buf.Bytes()), "want text, got: %q", buf.String())
}

func (s *LoggerSuite) TestNew_levelFiltering() {
	tests := []struct {
		name     string
		level    string
		wantEmit bool
	}{
		{"debug-allows-debug", "debug", true},
		{"info-blocks-debug", "info", false},
		{"warn-blocks-debug", "warn", false},
		{"warning-blocks-debug", "warning", false},
		{"error-blocks-debug", "error", false},
		{"empty-defaults-info", "", false},
		{"unknown-defaults-info", "trace", false},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			var buf bytes.Buffer
			log := logger.New(&buf, logger.Config{Level: tt.level})
			log.Debug("debug-msg")
			got := strings.Contains(buf.String(), "debug-msg")
			assert.Equal(s.T(), got, tt.wantEmit)
		})
	}
}

func (s *LoggerSuite) TestNew_addSource() {
	var buf bytes.Buffer
	log := logger.New(&buf, logger.Config{AddSource: true})
	log.Info("x")

	var entry map[string]any
	assert.NilError(s.T(), json.Unmarshal(buf.Bytes(), &entry))
	_, ok := entry["source"]
	assert.Assert(s.T(), ok, "expected source key when AddSource=true: %v", entry)
}
