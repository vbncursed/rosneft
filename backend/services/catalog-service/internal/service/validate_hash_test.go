package service_test

import (
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type BlobHashSuite struct{ suite.Suite }

func TestBlobHashSuite(t *testing.T) { suite.Run(t, new(BlobHashSuite)) }

func (s *BlobHashSuite) TestSourceAndThumbnailValidation() {
	cases := []struct {
		name, hash, message string
	}{
		{"empty", "", "empty blob hash"},
		{"63 bytes", strings.Repeat("a", 63), "blob hash must be 64 hex characters"},
		{"64 bytes", validBlobHash, ""},
		{"65 bytes", strings.Repeat("a", 65), "blob hash must be 64 hex characters"},
		{"uppercase", strings.Repeat("A", 64), "blob hash contains non-hex character"},
		{"malicious start", ";" + strings.Repeat("a", 63), "blob hash contains non-hex character"},
		{
			"malicious middle",
			strings.Repeat("a", 32) + "$" + strings.Repeat("a", 31),
			"blob hash contains non-hex character",
		},
		{"malicious end", strings.Repeat("a", 63) + "`", "blob hash contains non-hex character"},
		{"unicode", strings.Repeat("a", 62) + "é", "blob hash contains non-hex character"},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			repo := mocks.NewRepositoryMock(minimock.NewController(s.T()))
			svc := service.New(repo)
			ctx := s.T().Context()
			source := domain.TerritoryPatch{SourceBlobHash: new(tc.hash)}
			thumbnail := domain.ModelPatch{ThumbnailBlobHash: new(tc.hash)}
			if tc.message == "" {
				repo.UpdateTerritoryMock.Expect(ctx, "site", source).Return(domain.Territory{}, nil)
			}
			if tc.message == "" || tc.hash == "" {
				repo.UpdateModelMock.Expect(ctx, "model", thumbnail).Return(domain.Model{}, nil)
			}
			_, sourceErr := svc.UpdateTerritory(ctx, "site", source)
			_, thumbnailErr := svc.UpdateModel(ctx, "model", thumbnail)
			if tc.message == "" {
				assert.NilError(s.T(), sourceErr)
			} else {
				assert.ErrorIs(s.T(), sourceErr, domain.ErrInvalidInput)
				assert.ErrorContains(s.T(), sourceErr, tc.message)
			}
			if tc.message == "" || tc.hash == "" {
				assert.NilError(s.T(), thumbnailErr)
			} else {
				assert.ErrorIs(s.T(), thumbnailErr, domain.ErrInvalidInput)
				assert.ErrorContains(s.T(), thumbnailErr, tc.message)
			}
		})
	}
}
