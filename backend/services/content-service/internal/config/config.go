// Package config builds the content service configuration via Viper, layered
// as flag > env (CONTENT_*) > default.
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// Config aggregates all runtime knobs.
type Config struct {
	GRPCAddr        string        `mapstructure:"grpc-addr"`
	DBDSN           string        `mapstructure:"db-dsn"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	AutoMigrate     bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "CONTENT"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9007")
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("auto-migrate", true)
	v.SetDefault("shutdown-timeout", 15*time.Second)

	if err := v.BindPFlags(cmd.Root().PersistentFlags()); err != nil {
		return Config{}, fmt.Errorf("config: bind persistent flags: %w", err)
	}
	if err := v.BindPFlags(cmd.Flags()); err != nil {
		return Config{}, fmt.Errorf("config: bind flags: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, fmt.Errorf("config: unmarshal: %w", err)
	}
	return cfg, nil
}

// Validate fails fast on missing required values.
func (c Config) Validate() error {
	if c.DBDSN == "" {
		return fmt.Errorf("config: db-dsn is required (set --db-dsn or %s_DB_DSN)", envPrefix)
	}
	return nil
}
