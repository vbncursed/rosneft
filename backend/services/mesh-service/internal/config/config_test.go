package config_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
)

type ConfigSuite struct {
	suite.Suite
}

func TestConfigSuite(t *testing.T) {
	suite.Run(t, new(ConfigSuite))
}

func (s *ConfigSuite) TestParsedLODRatios_emptyReturnsNil() {
	c := config.Config{LODRatios: nil}
	out, err := c.ParsedLODRatios()
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), out == nil)
}

func (s *ConfigSuite) TestParsedLODRatios_validList() {
	c := config.Config{LODRatios: []string{"0.5", "0.25"}}
	out, err := c.ParsedLODRatios()
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), out[0], 0.5)
	assert.Equal(s.T(), out[1], 0.25)
}

func (s *ConfigSuite) TestParsedLODRatios_trimsAndSkipsEmpty() {
	c := config.Config{LODRatios: []string{" 0.5 ", "", "0.25"}}
	out, err := c.ParsedLODRatios()
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2)
}

func (s *ConfigSuite) TestParsedLODRatios_rejectsZero() {
	c := config.Config{LODRatios: []string{"0"}}
	_, err := c.ParsedLODRatios()
	assert.ErrorContains(s.T(), err, "out of range")
}

func (s *ConfigSuite) TestParsedLODRatios_rejectsOne() {
	c := config.Config{LODRatios: []string{"1"}}
	_, err := c.ParsedLODRatios()
	assert.ErrorContains(s.T(), err, "out of range")
}

func (s *ConfigSuite) TestParsedLODRatios_rejectsNegative() {
	c := config.Config{LODRatios: []string{"-0.5"}}
	_, err := c.ParsedLODRatios()
	assert.ErrorContains(s.T(), err, "out of range")
}

func (s *ConfigSuite) TestParsedLODRatios_rejectsMalformed() {
	c := config.Config{LODRatios: []string{"abc"}}
	_, err := c.ParsedLODRatios()
	assert.ErrorContains(s.T(), err, "invalid lod-ratio")
}
