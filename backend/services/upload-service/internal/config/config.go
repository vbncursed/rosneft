// Package config builds the upload service configuration via Viper, layered
// as flag > env (UPLOAD_*) > default. Cobra binds flags into Viper at every
// command invocation so subcommands inherit the same surface.
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
	MetricsAddr     string        `mapstructure:"metrics-addr"`
	BlobDir         string        `mapstructure:"blob-dir"`
	IncomingDir     string        `mapstructure:"incoming-dir"`
	MaxUploadBytes  int64         `mapstructure:"max-upload-bytes"`
	LogLevel        string        `mapstructure:"log-level"`
	LogFormat       string        `mapstructure:"log-format"`
	ShutdownTimeout time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "UPLOAD"

// Load resolves configuration from cobra flags + env. Call once per command
// invocation; do not share Viper across commands.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9003")
	v.SetDefault("metrics-addr", ":9101")
	v.SetDefault("blob-dir", "/var/blob")
	v.SetDefault("incoming-dir", "/var/upload/incoming")
	v.SetDefault("max-upload-bytes", int64(2<<30)) // 2 GiB safety cap
	v.SetDefault("log-level", "info")
	v.SetDefault("log-format", "json")
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
	if c.IncomingDir == "" {
		return fmt.Errorf("config: incoming-dir is required (set --incoming-dir or %s_INCOMING_DIR)", envPrefix)
	}
	return nil
}
