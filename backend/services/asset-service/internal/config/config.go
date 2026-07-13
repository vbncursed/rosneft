// Package config builds the asset-service configuration via Viper.
// Layered as flag > env (ASSET_*) > default.
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
	HTTPAddr        string        `mapstructure:"http-addr"`
	MetricsAddr     string        `mapstructure:"metrics-addr"`
	BlobDir         string        `mapstructure:"blob-dir"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	ReadTimeout     time.Duration `mapstructure:"read-timeout"`
	WriteTimeout    time.Duration `mapstructure:"write-timeout"`
	IdleTimeout     time.Duration `mapstructure:"idle-timeout"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "ASSET"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("http-addr", ":8081")
	v.SetDefault("metrics-addr", ":9101")
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
	v.SetDefault("read-timeout", 5*time.Second)
	// Write timeout is generous because GLB payloads can be tens of MB and
	// clients on slow links must finish within this window.
	v.SetDefault("write-timeout", 5*time.Minute)
	v.SetDefault("idle-timeout", 2*time.Minute)
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
	if c.BlobDir == "" {
		return fmt.Errorf("config: blob-dir is required (set --blob-dir or %s_BLOB_DIR)", envPrefix)
	}
	return nil
}
