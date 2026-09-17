package httpapi

import (
	"bytes"
	"encoding/json/v2"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type BodyLimitSuite struct{ suite.Suite }

func TestBodyLimitSuite(t *testing.T) { suite.Run(t, new(BodyLimitSuite)) }

// serve runs one request through LimitBody and reports what the handler read.
func (s *BodyLimitSuite) serve(method, path string, body io.Reader) (*httptest.ResponseRecorder, int, bool) {
	var read int
	var reached bool
	h := LimitBody(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		reached = true
		b, err := io.ReadAll(r.Body)
		assert.NilError(s.T(), err)
		read = len(b)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), method, path, body))
	return rec, read, reached
}

func (s *BodyLimitSuite) TestABodyAtTheLimitPassesWhole() {
	rec, read, _ := s.serve(http.MethodPost, "/api/territories", bytes.NewReader(make([]byte, maxJSONBodyBytes)))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), read, maxJSONBodyBytes)
}

func (s *BodyLimitSuite) TestABodyOverTheLimitIs413AndNeverReachesTheHandler() {
	rec, _, reached := s.serve(http.MethodPost, "/api/auth/login", bytes.NewReader(make([]byte, maxJSONBodyBytes+1)))
	assert.Equal(s.T(), rec.Code, http.StatusRequestEntityTooLarge)
	assert.Assert(s.T(), !reached)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"payload_too_large"`), rec.Body.String())
}

// Without Content-Length (chunked) the size is only known by reading.
func (s *BodyLimitSuite) TestAChunkedBodyOverTheLimitIs413() {
	body := io.MultiReader(bytes.NewReader(make([]byte, maxJSONBodyBytes)), strings.NewReader("x"))
	rec, _, reached := s.serve(http.MethodPut, "/api/auth/roles/x/permissions", body)
	assert.Equal(s.T(), rec.Code, http.StatusRequestEntityTooLarge)
	assert.Assert(s.T(), !reached)
}

// The chunk PATCH streams raw bytes to upload-service, which bounds each
// session by its declared size; the JSON cap must not apply to it.
func (s *BodyLimitSuite) TestTheChunkPatchIsExempt() {
	rec, read, _ := s.serve(http.MethodPatch, "/api/uploads/abc", bytes.NewReader(make([]byte, 3*maxJSONBodyBytes)))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), read, 3*maxJSONBodyBytes)
}

// Only the chunk PATCH is exempt; finalize is an ordinary request.
func (s *BodyLimitSuite) TestOtherUploadRoutesAreLimited() {
	rec, _, _ := s.serve(http.MethodPost, "/api/uploads/abc/finalize", bytes.NewReader(make([]byte, maxJSONBodyBytes+1)))
	assert.Equal(s.T(), rec.Code, http.StatusRequestEntityTooLarge)
}

// The largest legitimate body is a 1000-point measurement (catalog's cap) with
// every coordinate at its longest JSON spelling; it must fit with room to spare.
func (s *BodyLimitSuite) TestTheLargestMeasurementFitsTwiceOver() {
	coord := -math.MaxFloat64 / 3 // 24 characters in JSON
	points := make([]Vec3, 1000)
	for i := range points {
		points[i] = Vec3{X: coord, Y: coord, Z: coord}
	}
	body, err := json.Marshal(MeasurementWrite{Points: points, Closed: true})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), 2*len(body) < maxJSONBodyBytes, "measurement body is %d bytes", len(body))

	rec, read, _ := s.serve(http.MethodPost, "/api/territories/yard/measurements", bytes.NewReader(body))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), read, len(body))
}

// countingReader records how many bytes anyone pulled out of it.
type countingReader struct {
	io.Reader
	read int
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.Reader.Read(p)
	c.read += n
	return n, err
}

// When Content-Length already says the body is too large, the answer is known
// without reading a byte — an anonymous caller must not make the gateway pull
// in a mebibyte first.
func (s *BodyLimitSuite) TestADeclaredOversizeIsRefusedUnread() {
	body := &countingReader{Reader: bytes.NewReader(make([]byte, 2*maxJSONBodyBytes))}
	req := httptest.NewRequestWithContext(s.T().Context(), http.MethodPost, "/api/auth/login", body)
	req.ContentLength = 2 * maxJSONBodyBytes
	rec := httptest.NewRecorder()

	LimitBody(http.NotFoundHandler()).ServeHTTP(rec, req)

	assert.Equal(s.T(), rec.Code, http.StatusRequestEntityTooLarge)
	assert.Equal(s.T(), body.read, 0)
}
