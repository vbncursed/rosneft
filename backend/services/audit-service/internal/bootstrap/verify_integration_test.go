//go:build integration

package bootstrap_test

import (
	"errors"
	"os"
	"path/filepath"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/bootstrap"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/digest"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

func (s *RunnersIntegrationSuite) TestRunVerify() {
	ctx := s.T().Context()
	svc := service.New(storage.New(s.pool))
	checkpoint, err := svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	cfg := s.cfg
	cfg.DigestFile = filepath.Join(s.T().TempDir(), "witness.jsonl")
	writer, err := digest.Open(cfg.DigestFile)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), writer.Write(checkpoint))
	assert.NilError(s.T(), writer.Close())
	s.Run("intact witness", func() {
		assert.NilError(s.T(), bootstrap.RunVerify(ctx, cfg))
	})
	s.Run("witness disagreement", func() {
		checkpoint.Digest = "tampered"
		path := filepath.Join(s.T().TempDir(), "witness.jsonl")
		w, err := digest.Open(path)
		assert.NilError(s.T(), err)
		assert.NilError(s.T(), w.Write(checkpoint))
		assert.NilError(s.T(), w.Close())
		altered := cfg
		altered.DigestFile = path
		err = bootstrap.RunVerify(ctx, altered)
		assert.ErrorIs(s.T(), err, bootstrap.ErrJournalTampered)
		assert.ErrorContains(s.T(), err, "witness disagrees")
	})
	s.Run("witnessed checkpoint missing from database", func() {
		checkpoint.ID += 1000
		path := filepath.Join(s.T().TempDir(), "witness.jsonl")
		w, err := digest.Open(path)
		assert.NilError(s.T(), err)
		assert.NilError(s.T(), w.Write(checkpoint))
		assert.NilError(s.T(), w.Close())
		altered := cfg
		altered.DigestFile = path
		err = bootstrap.RunVerify(ctx, altered)
		assert.ErrorIs(s.T(), err, bootstrap.ErrJournalTampered)
		assert.ErrorContains(s.T(), err, "database has no such checkpoint")
	})
	s.Run("missing witness file", func() {
		altered := cfg
		altered.DigestFile = filepath.Join(s.T().TempDir(), "missing")
		err := bootstrap.RunVerify(ctx, altered)
		assert.Assert(s.T(), errors.Is(err, os.ErrNotExist))
		assert.Assert(s.T(), !errors.Is(err, bootstrap.ErrJournalTampered))
	})
}
