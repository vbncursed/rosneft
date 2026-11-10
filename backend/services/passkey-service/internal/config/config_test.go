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

func (s *ConfigSuite) TestLoad() {
	t := s.T()
	t.Setenv("PASSKEY_GRPC_ADDR", ":1234")
	t.Setenv("PASSKEY_RP_ORIGINS", "https://one.example, , https://two.example")
	root := &cobra.Command{Use: "passkey"}
	root.PersistentFlags().String("grpc-addr", "", "")
	root.PersistentFlags().StringSlice("rp-origins", nil, "")
	cmd := &cobra.Command{Use: "serve"}
	root.AddCommand(cmd)
	cmd.Flags().String("rp-name", "", "")
	assert.NilError(t, cmd.Flags().Set("rp-name", "Flag name"))
	cfg, err := Load(cmd)
	assert.NilError(t, err)
	assert.Equal(t, cfg.GRPCAddr, ":1234")
	assert.Equal(t, cfg.RPName, "Flag name")
	assert.DeepEqual(t, cfg.RPOrigins, []string{"https://one.example", "https://two.example"})
	assert.Equal(t, cfg.CeremonyTTL, 5*time.Minute)
	assert.Equal(t, cfg.RedisDB, 3)
	assert.Equal(t, cfg.AutoMigrate, true)
	assert.NilError(t, root.PersistentFlags().Set("grpc-addr", ":5678"))
	cfg, err = Load(cmd)
	assert.NilError(t, err)
	assert.Equal(t, cfg.GRPCAddr, ":5678")
}

func (s *ConfigSuite) TestOriginsFlagAndEmptyValues() {
	t := s.T()
	t.Setenv("PASSKEY_RP_ORIGINS", "https://env.example")
	cmd := &cobra.Command{}
	cmd.Flags().StringSlice("rp-origins", nil, "")
	assert.NilError(t, cmd.Flags().Set("rp-origins", " https://flag.example, ,https://other.example "))
	cfg, err := Load(cmd)
	assert.NilError(t, err)
	assert.DeepEqual(t, cfg.RPOrigins, []string{"https://flag.example", "https://other.example"})
}

func (s *ConfigSuite) TestEmptyOrigins() {
	t := s.T()
	t.Setenv("PASSKEY_RP_ORIGINS", " , , ")
	cmd := &cobra.Command{}
	cmd.Flags().StringSlice("rp-origins", nil, "")
	cfg, err := Load(cmd)
	assert.NilError(t, err)
	assert.Equal(t, len(cfg.RPOrigins), 0)
}

func (s *ConfigSuite) TestLoadInvalidValue() {
	t := s.T()
	t.Setenv("PASSKEY_REDIS_DB", "invalid")
	_, err := Load(&cobra.Command{})
	assert.ErrorContains(t, err, "config: unmarshal")
}

func (s *ConfigSuite) TestValidate() {
	t := s.T()
	tests := []struct {
		name string
		cfg  Config
		want string
	}{
		{"missing dsn", Config{}, "db-dsn is required"},
		{"missing rp id", Config{DBDSN: "dsn"}, "rp-id is required"},
		{"missing origins", Config{DBDSN: "dsn", RPID: "example.com"}, "rp-origins is required"},
		{"valid", Config{DBDSN: "dsn", RPID: "example.com", RPOrigins: []string{"https://example.com"}}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if tt.want == "" {
				assert.NilError(t, err)
				return
			}
			assert.ErrorContains(t, err, tt.want)
		})
	}
}
