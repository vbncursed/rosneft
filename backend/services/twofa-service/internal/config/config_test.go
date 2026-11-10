package config

import (
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ConfigSuite struct{ suite.Suite }

func TestConfig(t *testing.T) { suite.Run(t, new(ConfigSuite)) }

func (s *ConfigSuite) SetupTest() {
	for _, name := range []string{"GRPC_ADDR", "METRICS_ADDR", "DB_DSN", "REDIS_ADDR", "REDIS_DB", "SECRET_KEY", "ISSUER", "VERIFY_MAX_FAILS", "VERIFY_LOCK_TTL", "LOG_LEVEL", "LOG_FORMAT", "AUTO_MIGRATE", "SHUTDOWN_TIMEOUT"} {
		s.T().Setenv("TWOFA_"+name, "")
	}
}

func (s *ConfigSuite) TestDefaults() {
	cfg, err := Load(&cobra.Command{})
	assert.NilError(s.T(), err)
	assert.DeepEqual(
		s.T(),
		cfg,
		Config{
			GRPCAddr:        ":9006",
			MetricsAddr:     ":9101",
			RedisAddr:       "redis:6379",
			RedisDB:         2,
			Issuer:          "Andrey",
			VerifyMaxFails:  5,
			VerifyLockTTL:   15 * time.Minute,
			LogLevel:        "info",
			LogFormat:       "json",
			AutoMigrate:     true,
			ShutdownTimeout: 15 * time.Second,
		},
	)
}

func (s *ConfigSuite) TestEnvironmentAndFlagPrecedence() {
	t := s.T()
	for name, value := range map[string]string{"GRPC_ADDR": ":1111", "METRICS_ADDR": ":2222", "DB_DSN": "env-dsn", "REDIS_ADDR": "env-redis", "REDIS_DB": "7", "SECRET_KEY": "env-key", "ISSUER": "env-issuer", "VERIFY_MAX_FAILS": "9", "VERIFY_LOCK_TTL": "3m", "LOG_LEVEL": "debug", "LOG_FORMAT": "text", "AUTO_MIGRATE": "false", "SHUTDOWN_TIMEOUT": "42s"} {
		t.Setenv("TWOFA_"+name, value)
	}
	root := &cobra.Command{Use: "twofa"}
	root.PersistentFlags().String("db-dsn", "", "")
	root.PersistentFlags().String("secret-key", "", "")
	root.PersistentFlags().String("grpc-addr", ":9006", "")
	cmd := &cobra.Command{Use: "serve"}
	root.AddCommand(cmd)
	cmd.Flags().String("issuer", "Andrey", "")
	cfg, err := Load(cmd)
	assert.NilError(t, err)
	assert.Assert(t, cfg.DBDSN == "env-dsn" && cfg.SecretKey == "env-key")
	cfg.DBDSN, cfg.SecretKey = "", ""
	assert.DeepEqual(
		t,
		cfg,
		Config{
			GRPCAddr:        ":1111",
			MetricsAddr:     ":2222",
			RedisAddr:       "env-redis",
			RedisDB:         7,
			Issuer:          "env-issuer",
			VerifyMaxFails:  9,
			VerifyLockTTL:   3 * time.Minute,
			LogLevel:        "debug",
			LogFormat:       "text",
			AutoMigrate:     false,
			ShutdownTimeout: 42 * time.Second,
		},
	)
	assert.NilError(t, root.PersistentFlags().Set("grpc-addr", ":3333"))
	assert.NilError(t, cmd.Flags().Set("issuer", "flag-issuer"))
	cfg, err = Load(cmd)
	assert.NilError(t, err)
	assert.Equal(t, cfg.GRPCAddr, ":3333")
	assert.Equal(t, cfg.Issuer, "flag-issuer")
}

func (s *ConfigSuite) TestInvalidEnvironment() {
	for _, name := range []string{"REDIS_DB", "VERIFY_MAX_FAILS", "VERIFY_LOCK_TTL", "SHUTDOWN_TIMEOUT"} {
		s.Run(name, func() {
			s.T().Setenv("TWOFA_"+name, "invalid")
			_, err := Load(&cobra.Command{})
			assert.ErrorContains(s.T(), err, "config: unmarshal")
		})
	}
}

func (s *ConfigSuite) TestValidate() {
	for _, tt := range []struct {
		name string
		cfg  Config
		want string
	}{
		{"both missing", Config{}, "db-dsn is required"},
		{"key missing", Config{DBDSN: "dsn"}, "secret-key is required"},
		{"valid", Config{DBDSN: "dsn", SecretKey: "key"}, ""},
	} {
		s.Run(tt.name, func() {
			err := tt.cfg.Validate()
			if tt.want == "" {
				assert.NilError(s.T(), err)
			} else {
				assert.ErrorContains(s.T(), err, tt.want)
			}
		})
	}
}
