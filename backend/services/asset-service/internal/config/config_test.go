package config_test

import (
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/config"
)

type ConfigSuite struct{ suite.Suite }

func TestConfigSuite(t *testing.T) { suite.Run(t, new(ConfigSuite)) }
func (s *ConfigSuite) SetupTest() {
	for _, key := range []string{"HTTP_ADDR", "METRICS_ADDR", "BLOB_DIR", "LOG_LEVEL", "LOG_FORMAT", "READ_TIMEOUT", "WRITE_TIMEOUT", "IDLE_TIMEOUT", "SHUTDOWN_TIMEOUT"} {
		s.T().Setenv("ASSET_"+key, "")
	}
}

func (s *ConfigSuite) TestDefaultsAndValidation() {
	cfg, err := config.Load(&cobra.Command{})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cfg.HTTPAddr, ":8081")
	assert.Equal(s.T(), cfg.MetricsAddr, ":9101")
	assert.Equal(s.T(), cfg.LogLevel, "info")
	assert.Equal(s.T(), cfg.LogFormat, "json")
	assert.Equal(s.T(), cfg.ReadTimeout, 5*time.Second)
	assert.Equal(s.T(), cfg.WriteTimeout, 5*time.Minute)
	assert.Equal(s.T(), cfg.IdleTimeout, 2*time.Minute)
	assert.Equal(s.T(), cfg.ShutdownTimeout, 15*time.Second)
	assert.ErrorContains(s.T(), cfg.Validate(), "blob-dir is required")
}

func (s *ConfigSuite) TestEnvironmentAndFlagPrecedence() {
	s.T().Setenv("ASSET_HTTP_ADDR", ":2222")
	s.T().Setenv("ASSET_BLOB_DIR", "/env/blobs")
	s.T().Setenv("ASSET_READ_TIMEOUT", "12s")
	cmd := &cobra.Command{}
	cmd.PersistentFlags().String("http-addr", ":8081", "")
	cmd.PersistentFlags().String("blob-dir", "", "")
	assert.NilError(s.T(), cmd.PersistentFlags().Set("http-addr", ":3333"))
	cfg, err := config.Load(cmd)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cfg.HTTPAddr, ":3333")
	assert.Equal(s.T(), cfg.BlobDir, "/env/blobs")
	assert.Equal(s.T(), cfg.ReadTimeout, 12*time.Second)
	assert.NilError(s.T(), cfg.Validate())
}

func (s *ConfigSuite) TestInvalidDuration() {
	s.T().Setenv("ASSET_READ_TIMEOUT", "bad-duration")
	_, err := config.Load(&cobra.Command{})
	assert.ErrorContains(s.T(), err, "config: unmarshal")
}
