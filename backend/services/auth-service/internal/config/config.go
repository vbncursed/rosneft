// Package config builds the auth service configuration via Viper, layered as
// flag > env (AUTH_*) > default.
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
	GRPCAddr           string        `mapstructure:"grpc-addr"`
	DBDSN              string        `mapstructure:"db-dsn"`
	RedisAddr          string        `mapstructure:"redis-addr"`
	RedisDB            int           `mapstructure:"redis-db"`
	TwoFAGRPCAddr      string        `mapstructure:"twofa-grpc-addr"`   // twofa-service address for login 2FA checks
	PasskeyGRPCAddr    string        `mapstructure:"passkey-grpc-addr"` // passkey-service address for passwordless login
	SessionIdleTTL     time.Duration `mapstructure:"session-idle-ttl"`
	SessionAbsoluteTTL time.Duration `mapstructure:"session-absolute-ttl"`
	Pending2FATTL      time.Duration `mapstructure:"pending-2fa-ttl"`
	LoginMaxFails      int           `mapstructure:"login-max-fails"`
	LoginLockTTL       time.Duration `mapstructure:"login-lock-ttl"`
	BootstrapEmail     string        `mapstructure:"bootstrap-email"`
	BootstrapUsername  string        `mapstructure:"bootstrap-username"`
	BootstrapPassword  string        `mapstructure:"bootstrap-password"`
	LogLevel           string        `mapstructure:"log-level"`
	LogFormat          string        `mapstructure:"log-format"`
	AutoMigrate        bool          `mapstructure:"auto-migrate"`
	ShutdownTimeout    time.Duration `mapstructure:"shutdown-timeout"`
}

const envPrefix = "AUTH"

// Load resolves configuration from cobra flags + env.
func Load(cmd *cobra.Command) (Config, error) {
	v := viper.New()
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
	v.AutomaticEnv()

	v.SetDefault("grpc-addr", ":9004")
	v.SetDefault("redis-addr", "redis:6379")
	v.SetDefault("redis-db", 1)
	v.SetDefault("twofa-grpc-addr", "twofa:9006")
	v.SetDefault("passkey-grpc-addr", "passkey:9008")
	v.SetDefault("session-idle-ttl", 24*time.Hour)
	v.SetDefault("session-absolute-ttl", 720*time.Hour)
	v.SetDefault("pending-2fa-ttl", 5*time.Minute)
	v.SetDefault("login-max-fails", 5)
	v.SetDefault("login-lock-ttl", 15*time.Minute)
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
