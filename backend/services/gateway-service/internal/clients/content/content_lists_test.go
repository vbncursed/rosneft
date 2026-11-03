package content

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
	"gotest.tools/v3/assert"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcmock"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type ContentListsSuite struct{ suite.Suite }

func TestContentListsSuite(t *testing.T) { suite.Run(t, new(ContentListsSuite)) }

func (s *ContentListsSuite) TestDocuments() {
	ctx := s.T().Context()
	stamp := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
	conn := grpcmock.NewClientConnInterfaceMock(s.T())
	conn.InvokeMock.Set(func(got context.Context, method string, req, reply any, _ ...grpc.CallOption) error {
		assert.Equal(s.T(), got, ctx)
		assert.Equal(s.T(), method, contentv1.ContentService_ListDocuments_FullMethodName)
		assert.Equal(s.T(), req.(*contentv1.ListDocumentsRequest).GetTerritorySlug(), "yard")
		reply.(*contentv1.ListDocumentsResponse).Documents = []*contentv1.Document{
			{
				Id:             2,
				TerritorySlug:  "yard",
				Title:          "plan",
				SourceBlobHash: "abc",
				CreatedAt:      timestamppb.New(stamp),
				Calibration: &contentv1.Calibration{
					Page: 3,
					Points: []*contentv1.CalibrationPoint{
						{PdfX: 1, PdfY: 2, SceneX: 3, SceneY: 4, SceneZ: 5, UtmE: new(6.0), UtmN: new(7.0)},
					},
				},
			},
			{Id: 1, Title: "other"},
		}
		return nil
	})
	got, err := (&Client{cc: contentv1.NewContentServiceClient(conn)}).ListDocuments(ctx, "yard")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []domain.Document{
		{
			ID:             2,
			TerritorySlug:  "yard",
			Title:          "plan",
			SourceBlobHash: "abc",
			CreatedAt:      stamp,
			Calibration: &domain.Calibration{
				Page: 3,
				Points: []domain.CalibrationPoint{
					{PDF: domain.Vec2{X: 1, Y: 2}, Scene: domain.Vec3{X: 3, Y: 4, Z: 5}, UTM: &domain.UTM{E: 6, N: 7}},
				},
			},
		},
		{ID: 1, Title: "other", CreatedAt: (*timestamppb.Timestamp)(nil).AsTime()},
	})
}

func (s *ContentListsSuite) TestPanoramas() {
	ctx := s.T().Context()
	stamp := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
	conn := grpcmock.NewClientConnInterfaceMock(s.T())
	conn.InvokeMock.Set(func(got context.Context, method string, req, reply any, _ ...grpc.CallOption) error {
		assert.Equal(s.T(), got, ctx)
		assert.Equal(s.T(), method, contentv1.ContentService_ListPanoramas_FullMethodName)
		assert.Equal(s.T(), req.(*contentv1.ListPanoramasRequest).GetTerritorySlug(), "yard")
		reply.(*contentv1.ListPanoramasResponse).Panoramas = []*contentv1.Panorama{
			{
				Id:                2,
				TerritorySlug:     "yard",
				Slug:              "north",
				Title:             "North",
				SourceBlobHash:    "abc",
				ThumbnailBlobHash: "def",
				Position:          &contentv1.Vec3{X: 1, Y: 2, Z: 3},
				YawOffset:         4,
				DefaultYaw:        5,
				CreatedAt:         timestamppb.New(stamp),
				UpdatedAt:         timestamppb.New(stamp),
				Phase:             "post",
				Hidden:            true,
			},
			{Id: 1},
		}
		return nil
	})
	got, err := (&Client{cc: contentv1.NewContentServiceClient(conn)}).ListPanoramas(ctx, "yard")
	assert.NilError(s.T(), err)
	zeroStamp := (*timestamppb.Timestamp)(nil).AsTime()
	assert.DeepEqual(s.T(), got, []domain.Panorama{
		{
			ID:                2,
			TerritorySlug:     "yard",
			Slug:              "north",
			Title:             "North",
			SourceBlobHash:    "abc",
			ThumbnailBlobHash: "def",
			Position:          domain.Vec3{X: 1, Y: 2, Z: 3},
			YawOffset:         4,
			DefaultYaw:        5,
			CreatedAt:         stamp,
			UpdatedAt:         stamp,
			Phase:             "post",
			Hidden:            true,
		},
		{ID: 1, CreatedAt: zeroStamp, UpdatedAt: zeroStamp, Phase: domain.PhasePrior},
	})
}

func (s *ContentListsSuite) TestEmptyAndErrors() {
	for _, code := range []codes.Code{codes.OK, codes.NotFound, codes.InvalidArgument, codes.Unavailable} {
		s.Run(code.String(), func() {
			conn := grpcmock.NewClientConnInterfaceMock(s.T())
			conn.InvokeMock.Set(func(_ context.Context, _ string, _, _ any, _ ...grpc.CallOption) error {
				return status.Error(code, "failure")
			})
			c := &Client{cc: contentv1.NewContentServiceClient(conn)}
			docs, docErr := c.ListDocuments(s.T().Context(), "yard")
			panoramas, panErr := c.ListPanoramas(s.T().Context(), "yard")
			if code == codes.OK {
				assert.NilError(s.T(), docErr)
				assert.NilError(s.T(), panErr)
				assert.DeepEqual(s.T(), docs, []domain.Document{})
				assert.DeepEqual(s.T(), panoramas, []domain.Panorama{})
				return
			}
			assert.Assert(s.T(), docs == nil)
			assert.Assert(s.T(), panoramas == nil)
			for _, err := range []error{docErr, panErr} {
				assert.Equal(s.T(), status.Code(err), code)
				if code == codes.NotFound {
					assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
				}
				if code == codes.InvalidArgument {
					assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
				}
				if code == codes.Unavailable {
					assert.Assert(s.T(), !errors.Is(err, domain.ErrTerritoryNotFound))
				}
			}
		})
	}
}
