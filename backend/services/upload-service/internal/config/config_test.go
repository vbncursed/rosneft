package config_test

import (
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
	"gotest.tools/v3/assert/cmp"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/config"
)

type ConfigSuite struct{ suite.Suite }

func TestConfig(t *testing.T) { suite.Run(t, new(ConfigSuite)) }

func (s *ConfigSuite) SetupTest() {
	for _, key := range []string{"GRPC_ADDR", "METRICS_ADDR", "BLOB_DIR", "INCOMING_DIR", "MAX_UPLOAD_BYTES", "LOG_LEVEL", "LOG_FORMAT", "SHUTDOWN_TIMEOUT"} {
		s.T().Setenv("UPLOAD_"+key, "")
	}
}

func (s *ConfigSuite) TestDefaults() {
	cfg, err := config.Load(&cobra.Command{Use: "upload"})
	assert.NilError(s.T(), err)
	assert.DeepEqual(
		s.T(),
		cfg,
		config.Config{
			GRPCAddr:        ":9003",
			MetricsAddr:     ":9101",
			BlobDir:         "/var/blob",
			IncomingDir:     "/var/upload/incoming",
			MaxUploadBytes:  2 << 30,
			LogLevel:        "info",
			LogFormat:       "json",
			ShutdownTimeout: 15 * time.Second,
		},
	)
	assert.NilError(s.T(), cfg.Validate())
}

func (s *ConfigSuite) TestEnvironment() {
	for key, value := range map[string]string{"GRPC_ADDR": ":1111", "METRICS_ADDR": ":2222", "BLOB_DIR": "/blobs", "INCOMING_DIR": "/incoming", "MAX_UPLOAD_BYTES": "12345", "LOG_LEVEL": "debug", "LOG_FORMAT": "text", "SHUTDOWN_TIMEOUT": "42s"} {
		s.T().Setenv("UPLOAD_"+key, value)
	}
	cfg, err := config.Load(&cobra.Command{Use: "upload"})
	assert.NilError(s.T(), err)
	assert.DeepEqual(
		s.T(),
		cfg,
		config.Config{
			GRPCAddr:        ":1111",
			MetricsAddr:     ":2222",
			BlobDir:         "/blobs",
			IncomingDir:     "/incoming",
			MaxUploadBytes:  12345,
			LogLevel:        "debug",
			LogFormat:       "text",
			ShutdownTimeout: 42 * time.Second,
		},
	)
}

func (s *ConfigSuite) TestFlagsOverrideEnvironment() {
	s.T().Setenv("UPLOAD_BLOB_DIR", "/env-blobs")
	s.T().Setenv("UPLOAD_INCOMING_DIR", "/env-incoming")
	root := &cobra.Command{Use: "upload"}
	root.PersistentFlags().String("blob-dir", "/default-blobs", "")
	child := &cobra.Command{Use: "serve"}
	child.Flags().String("incoming-dir", "/default-incoming", "")
	root.AddCommand(child)
	assert.NilError(s.T(), root.PersistentFlags().Set("blob-dir", "/flag-blobs"))
	assert.NilError(s.T(), child.Flags().Set("incoming-dir", "/flag-incoming"))
	cfg, err := config.Load(child)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cfg.BlobDir, "/flag-blobs")
	assert.Equal(s.T(), cfg.IncomingDir, "/flag-incoming")
}

func (s *ConfigSuite) TestInvalidEnvironment() {
	for _, tc := range []struct{ key, value string }{{"MAX_UPLOAD_BYTES", "not-a-number"}, {"SHUTDOWN_TIMEOUT", "not-a-duration"}} {
		s.Run(tc.key, func() {
			s.T().Setenv("UPLOAD_"+tc.key, tc.value)
			_, err := config.Load(&cobra.Command{Use: "upload"})
			assert.Assert(s.T(), err != nil)
			assert.Assert(s.T(), cmp.ErrorContains(err, "config: unmarshal"))
		})
	}
}

func (s *ConfigSuite) TestRequiredDirectories() {
	for _, tc := range []struct {
		name    string
		cfg     config.Config
		message string
	}{
		{"blob", config.Config{IncomingDir: "/incoming"}, "blob-dir is required"},
		{"incoming", config.Config{BlobDir: "/blobs"}, "incoming-dir is required"},
		{"both", config.Config{}, "blob-dir is required"},
	} {
		s.Run(tc.name, func() { assert.ErrorContains(s.T(), tc.cfg.Validate(), tc.message) })
	}
}
