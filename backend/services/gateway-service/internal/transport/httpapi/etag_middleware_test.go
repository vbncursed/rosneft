package httpapi

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
)

type ETagMiddlewareSuite struct{ suite.Suite }

func TestETagMiddlewareSuite(t *testing.T) { suite.Run(t, new(ETagMiddlewareSuite)) }

func (s *ETagMiddlewareSuite) TestConditionalGET() {
	const body = "representation"
	tag := fmt.Sprintf("%q", fmt.Sprintf("%x", sha256.Sum256([]byte(body))))
	cases := []struct {
		name, header string
		status       int
	}{
		{"missing", "", http.StatusOK},
		{"exact", tag, http.StatusNotModified},
		{"different", `"other"`, http.StatusOK},
		{"list match", `"other", ` + tag + `, "last"`, http.StatusNotModified},
		{"list no match", `"other", "last"`, http.StatusOK},
		{"wildcard", "*", http.StatusNotModified},
		{"whitespace wildcard", " \t* \t", http.StatusNotModified},
		{"whitespace tag", " \t" + tag + " \t", http.StatusNotModified},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			handler := ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Vary", "Origin")
				_, _ = w.Write([]byte(body))
			}))
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("If-None-Match", tc.header)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			s.Equal(tc.status, response.Code)
			s.Equal(tag, response.Header().Get("ETag"))
			s.ElementsMatch([]string{"origin", "accept-encoding"}, varyTokens(response.Header()))
			if tc.status == http.StatusNotModified {
				s.Empty(response.Body.String())
			} else {
				s.Equal(body, response.Body.String())
			}
		})
	}
}

func (s *ETagMiddlewareSuite) TestVaryAlreadyContainsEncoding() {
	handler := ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Vary", "Origin, accept-encoding")
		_, _ = w.Write([]byte("body"))
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	s.ElementsMatch([]string{"origin", "accept-encoding"}, varyTokens(response.Header()))
}

func (s *ETagMiddlewareSuite) TestSkippedResponses() {
	cases := []struct {
		name, method, body string
		status             int
	}{
		{"post", http.MethodPost, "changed", http.StatusCreated},
		{"error", http.MethodGet, "missing", http.StatusNotFound},
		{"empty", http.MethodGet, "", http.StatusNoContent},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			handler := ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Vary", "Origin")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			req := httptest.NewRequest(tc.method, "/", nil)
			req.Header.Set("If-None-Match", "*")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			s.Equal(tc.status, response.Code)
			s.Equal(tc.body, response.Body.String())
			s.Empty(response.Header().Get("ETag"))
			s.ElementsMatch([]string{"origin"}, varyTokens(response.Header()))
		})
	}
}

func varyTokens(header http.Header) []string {
	var tokens []string
	for _, value := range header.Values("Vary") {
		for token := range strings.SplitSeq(value, ",") {
			tokens = append(tokens, strings.ToLower(strings.TrimSpace(token)))
		}
	}
	return tokens
}
