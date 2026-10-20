// Package asset reads blob bytes from asset-service over its internal HTTP API.
package asset

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
)

// ErrRangeIgnored means the server answered a Range request with the whole
// body (a non-seekable store). Reading it would place wrong bytes.
var ErrRangeIgnored = errors.New("asset: range request not honoured")

// Client fetches blobs by hash. Its http.Client has no Timeout: the caller's
// context bounds each request, and an export body can take minutes.
type Client struct {
	base *url.URL
	http *http.Client
}

// New rejects a base URL without scheme or host.
func New(baseURL string) (*Client, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("asset: base url: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("asset: base url %q needs a scheme and a host", baseURL)
	}
	return &Client{base: u, http: &http.Client{}}, nil
}

// Open returns the blob's bytes from offset to its end. The caller closes it.
func (c *Client) Open(ctx context.Context, hash string, offset int64) (io.ReadCloser, error) {
	u := *c.base
	u.Path = "/assets/" + hash
	u.RawPath = "/assets/" + url.PathEscape(hash)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("asset: request: %w", err)
	}
	req.Header.Set("Range", "bytes="+strconv.FormatInt(offset, 10)+"-")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("asset: get: %w", err)
	}
	switch resp.StatusCode {
	case http.StatusPartialContent:
		return resp.Body, nil
	case http.StatusOK:
		_ = resp.Body.Close()
		return nil, ErrRangeIgnored
	default:
		_ = resp.Body.Close()
		return nil, fmt.Errorf("asset: get %s: status %d", hash, resp.StatusCode)
	}
}
