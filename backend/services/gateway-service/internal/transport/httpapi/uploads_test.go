package httpapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type UploadsSuite struct {
	suite.Suite
	mc *minimock.Controller
}

func (s *UploadsSuite) SetupTest() { s.mc = minimock.NewController(s.T()) }

func (s *UploadsSuite) server(upload *mocks.UploadMock) *Server {
	return New(
		service.New(
			mocks.NewCatalogMock(s.mc),
			mocks.NewContentMock(s.mc),
			mocks.NewMeshMock(s.mc),
			upload,
			mocks.NewAuditMock(s.mc),
			mocks.NewAuthMock(s.mc),
		),
	)
}

func TestUploadsSuite(t *testing.T) { suite.Run(t, new(UploadsSuite)) }

type abortStub struct {
	Service
	err error
}

func (a abortStub) AbortUpload(context.Context, string) error { return a.err }

// upload-service answers NOT_FOUND for another user's session (H-2); that is
// a 404 like HEAD/PATCH/finalize give, not a 500.
func (s *UploadsSuite) TestAbortOfAnotherUsersSessionIs404() {
	srv := New(abortStub{err: errors.Join(domain.ErrUploadNotFound, errors.New("rpc error"))})
	resp, err := srv.AbortUpload(s.T().Context(), AbortUploadRequestObject{Id: "abc"})
	assert.NilError(s.T(), err)
	_, is404 := resp.(AbortUpload404JSONResponse)
	assert.Assert(s.T(), is404, "got %T", resp)
}

func (s *UploadsSuite) TestAbortSucceedsWith204() {
	resp, err := New(abortStub{}).AbortUpload(s.T().Context(), AbortUploadRequestObject{Id: "abc"})
	assert.NilError(s.T(), err)
	_, is204 := resp.(AbortUpload204Response)
	assert.Assert(s.T(), is204, "got %T", resp)
}

type initiateStub struct{ Service }

func (initiateStub) InitiateUpload(_ context.Context, size int64, _ string) (domain.UploadSession, error) {
	return domain.UploadSession{ID: "u1", Size: size}, nil
}

// upload-service stores the normalised type, so the session echoes that value
// and not whatever the client sent.
func (s *UploadsSuite) TestInitiateEchoesTheNormalisedContentType() {
	tests := []struct{ name, sent, want string }{
		{"off the allow-list", "image/svg+xml", "application/octet-stream"},
		{"case and parameters", "Application/PDF; x=y", "application/pdf"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			resp, err := New(initiateStub{}).InitiateUpload(s.T().Context(), InitiateUploadRequestObject{
				Body: &InitiateUploadJSONRequestBody{Size: 1, ContentType: &tt.sent},
			})

			assert.NilError(s.T(), err)
			created, ok := resp.(InitiateUpload201JSONResponse)
			assert.Assert(s.T(), ok, "got %T", resp)
			assert.Assert(s.T(), created.ContentType != nil)
			assert.Equal(s.T(), *created.ContentType, tt.want)
		})
	}
}

func (s *UploadsSuite) TestAppend() {
	t := s.T()
	resp, err := New(gatewayWithoutCalls(t)).AppendUploadChunk(t.Context(), AppendUploadChunkRequestObject{})
	assert.NilError(t, err)
	code, body := rendered(t, resp.VisitAppendUploadChunkResponse)
	assert.Equal(t, code, http.StatusBadRequest)
	assert.Assert(t, strings.Contains(body, "empty body"))

	for _, tt := range []struct{ name, content string }{{"chunk", "chunk"}, {"empty reader", ""}} {
		s.Run(tt.name, func() {
			t := s.T()
			upload := mocks.NewUploadMock(s.mc)
			reader := strings.NewReader(tt.content)
			upload.WriteChunkMock.Set(func(_ context.Context, id string, offset int64, body io.Reader) (int64, error) {
				assert.Equal(t, id, "u1")
				assert.Equal(t, offset, int64(5))
				content, err := io.ReadAll(body)
				assert.NilError(t, err)
				assert.Equal(t, string(content), tt.content)
				return 9, nil
			})
			resp, err := s.server(upload).AppendUploadChunk(t.Context(), AppendUploadChunkRequestObject{
				Id: "u1", Params: AppendUploadChunkParams{UploadOffset: 5}, Body: reader,
			})
			assert.NilError(t, err)
			w := httptest.NewRecorder()
			assert.NilError(t, resp.VisitAppendUploadChunkResponse(w))
			assert.Equal(t, w.Code, http.StatusNoContent)
			assert.Equal(t, w.Header().Get("Upload-Offset"), "9")
			assert.Equal(t, w.Body.Len(), 0)
		})
	}
}

func (s *UploadsSuite) TestUploadErrors() {
	for _, tt := range []struct {
		name string
		err  error
		want int
	}{
		{"invalid", errors.Join(domain.ErrInvalidInput, errors.New("bad offset")), http.StatusBadRequest},
		{"missing", errors.Join(domain.ErrUploadNotFound, errors.New("rpc")), http.StatusNotFound},
		{"internal", errors.New("secret backend detail"), http.StatusInternalServerError},
	} {
		s.Run(tt.name, func() {
			t := s.T()
			upload := mocks.NewUploadMock(s.mc)
			reader := strings.NewReader("x")
			upload.WriteChunkMock.Expect(t.Context(), "u1", 0, reader).Return(0, tt.err)
			upload.FinalizeMock.Expect(t.Context(), "u1").Return(domain.FinalizedBlob{}, tt.err)
			if tt.want != http.StatusBadRequest {
				upload.GetStatusMock.Expect(t.Context(), "u1").Return(domain.UploadSession{}, tt.err)
			}
			srv := s.server(upload)
			appendResp, err := srv.AppendUploadChunk(
				t.Context(),
				AppendUploadChunkRequestObject{Id: "u1", Body: reader},
			)
			assert.NilError(t, err)
			code, body := rendered(t, appendResp.VisitAppendUploadChunkResponse)
			assert.Equal(t, code, tt.want)
			if tt.want == http.StatusInternalServerError {
				assert.Assert(t, !strings.Contains(body, "secret backend detail"))
			}
			finalResp, err := srv.FinalizeUpload(t.Context(), FinalizeUploadRequestObject{Id: "u1"})
			assert.NilError(t, err)
			code, body = rendered(t, finalResp.VisitFinalizeUploadResponse)
			assert.Equal(t, code, tt.want)
			if tt.want == http.StatusInternalServerError {
				assert.Assert(t, !strings.Contains(body, "secret backend detail"))
			}
			if tt.want != http.StatusBadRequest {
				statusResp, err := srv.GetUploadStatus(t.Context(), GetUploadStatusRequestObject{Id: "u1"})
				assert.NilError(t, err)
				code, body = rendered(t, statusResp.VisitGetUploadStatusResponse)
				assert.Equal(t, code, tt.want)
				if tt.want == http.StatusInternalServerError {
					assert.Assert(t, !strings.Contains(body, "secret backend detail"))
				}
			}
		})
	}
}

func (s *UploadsSuite) TestStatusAndFinalize() {
	t := s.T()
	upload := mocks.NewUploadMock(s.mc)
	upload.GetStatusMock.Expect(t.Context(), "u1").Return(domain.UploadSession{Offset: 9, Size: 20}, nil)
	upload.FinalizeMock.Expect(t.Context(), "u2").Return(domain.FinalizedBlob{Hash: "abc123", Size: 20}, nil)
	srv := s.server(upload)
	status, err := srv.GetUploadStatus(t.Context(), GetUploadStatusRequestObject{Id: "u1"})
	assert.NilError(t, err)
	w := httptest.NewRecorder()
	assert.NilError(t, status.VisitGetUploadStatusResponse(w))
	assert.Equal(t, w.Code, http.StatusOK)
	assert.Equal(t, w.Header().Get("Upload-Offset"), "9")
	assert.Equal(t, w.Header().Get("Upload-Length"), "20")
	assert.Equal(t, w.Body.Len(), 0)
	final, err := srv.FinalizeUpload(t.Context(), FinalizeUploadRequestObject{Id: "u2"})
	assert.NilError(t, err)
	code, body := rendered(t, final.VisitFinalizeUploadResponse)
	assert.Equal(t, code, http.StatusOK)
	assert.Assert(t, strings.Contains(body, `"hash":"abc123"`), body)
	assert.Assert(t, strings.Contains(body, `"size":20`), body)
}

func (s *UploadsSuite) TestUploadRoutes() {
	for _, tt := range []struct{ name, offset string }{{"missing", ""}, {"invalid", "invalid"}} {
		s.Run(tt.name, func() {
			t := s.T()
			handler := Mount(chi.NewRouter(), s.server(mocks.NewUploadMock(s.mc)))
			req := httptest.NewRequestWithContext(
				t.Context(),
				http.MethodPatch,
				"/api/uploads/u1",
				strings.NewReader("x"),
			)
			if tt.offset != "" {
				req.Header.Set("Upload-Offset", tt.offset)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			assert.Equal(t, w.Code, http.StatusBadRequest)
			assert.Equal(t, w.Header().Get("Cache-Control"), "no-store")
		})
	}
	t := s.T()
	upload := mocks.NewUploadMock(s.mc)
	upload.GetStatusMock.ExpectIdParam2("u1").Return(domain.UploadSession{Offset: 9, Size: 20}, nil)
	handler := Mount(chi.NewRouter(), s.server(upload))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequestWithContext(t.Context(), http.MethodHead, "/api/uploads/u1", nil))
	assert.Equal(t, w.Code, http.StatusOK)
	assert.Equal(t, w.Header().Get("Upload-Offset"), "9")
	assert.Equal(t, w.Header().Get("Upload-Length"), "20")
	assert.Equal(t, w.Body.Len(), 0)
}
