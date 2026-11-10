package config

import (
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type configSuite struct{ suite.Suite }

func TestConfigSuite(t *testing.T) { suite.Run(t, new(configSuite)) }

func (s *configSuite) SetupTest() {
	for _, key := range []string{"GRPC_ADDR", "METRICS_ADDR", "DB_DSN", "LOG_LEVEL", "LOG_FORMAT", "AUTO_MIGRATE", "SHUTDOWN_TIMEOUT", "CHECKPOINT_INTERVAL", "DIGEST_FILE", "BEFORE", "OUT"} {
		s.T().Setenv("AUDIT_"+key, "")
	}
}

func command() (*cobra.Command, *cobra.Command) {
	root := &cobra.Command{Use: "audit"}
	root.PersistentFlags().String("db-dsn", "", "")
	root.PersistentFlags().String("grpc-addr", ":9009", "")
	root.PersistentFlags().Bool("auto-migrate", true, "")
	root.PersistentFlags().Duration("shutdown-timeout", 15*time.Second, "")
	child := &cobra.Command{Use: "export"}
	child.Flags().String("out", "", "")
	root.AddCommand(child)
	return root, child
}

func (s *configSuite) TestDefaultsAndValidation() {
	_, cmd := command()
	cfg, err := Load(cmd)
	assert.NilError(s.T(), err)
	assert.DeepEqual(
		s.T(),
		cfg,
		Config{
			GRPCAddr:           ":9009",
			MetricsAddr:        ":9101",
			LogLevel:           "info",
			LogFormat:          "json",
			AutoMigrate:        true,
			ShutdownTimeout:    15 * time.Second,
			CheckpointInterval: 5 * time.Minute,
		},
	)
	assert.Error(s.T(), cfg.Validate(), "config: db-dsn is required (set --db-dsn or AUDIT_DB_DSN)")
}

func (s *configSuite) TestEnvironmentAndFlagPrecedence() {
	s.T().Setenv("AUDIT_DB_DSN", "postgres://example.invalid/audit")
	s.T().Setenv("AUDIT_GRPC_ADDR", ":8000")
	s.T().Setenv("AUDIT_METRICS_ADDR", ":8100")
	s.T().Setenv("AUDIT_AUTO_MIGRATE", "false")
	s.T().Setenv("AUDIT_SHUTDOWN_TIMEOUT", "30s")
	s.T().Setenv("AUDIT_CHECKPOINT_INTERVAL", "0s")
	s.T().Setenv("AUDIT_DIGEST_FILE", "/tmp/witness")
	s.T().Setenv("AUDIT_BEFORE", "2026-01-01")
	s.T().Setenv("AUDIT_OUT", "env.jsonl")
	root, cmd := command()
	assert.NilError(s.T(), root.PersistentFlags().Set("grpc-addr", ":7000"))
	assert.NilError(s.T(), cmd.Flags().Set("out", "flag.jsonl"))
	cfg, err := Load(cmd)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cfg.DBDSN, "postgres://example.invalid/audit")
	assert.Equal(s.T(), cfg.GRPCAddr, ":7000")
	assert.Equal(s.T(), cfg.MetricsAddr, ":8100")
	assert.Equal(s.T(), cfg.AutoMigrate, false)
	assert.Equal(s.T(), cfg.ShutdownTimeout, 30*time.Second)
	assert.Equal(s.T(), cfg.CheckpointInterval, time.Duration(0))
	assert.Equal(s.T(), cfg.DigestFile, "/tmp/witness")
	assert.Equal(s.T(), cfg.ExportBefore, "2026-01-01")
	assert.Equal(s.T(), cfg.ExportOut, "flag.jsonl")
	assert.NilError(s.T(), cfg.Validate())
}

func (s *configSuite) TestInvalidEnvironment() {
	for _, tc := range []struct{ key, value string }{{"AUDIT_SHUTDOWN_TIMEOUT", "bad-duration"}, {"AUDIT_AUTO_MIGRATE", "bad-bool"}} {
		s.Run(tc.key, func() {
			s.T().Setenv(tc.key, tc.value)
			_, cmd := command()
			_, err := Load(cmd)
			assert.ErrorContains(s.T(), err, "config: unmarshal:")
		})
	}
}

func (s *configSuite) TestDSNFlagOverridesEnvironment() {
	s.T().Setenv("AUDIT_DB_DSN", "postgres://example.invalid/from-env")
	root, cmd := command()
	assert.NilError(s.T(), root.PersistentFlags().Set("db-dsn", "postgres://example.invalid/from-flag"))
	cfg, err := Load(cmd)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cfg.DBDSN, "postgres://example.invalid/from-flag")
	assert.NilError(s.T(), cfg.Validate())
}
