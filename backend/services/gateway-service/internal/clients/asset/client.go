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
	"strings"
)

// ErrRangeIgnored means the server did not answer from the asked offset: a
// 200 with the whole body (a non-seekable store) or a 206 starting elsewhere.
// Reading it would place wrong bytes.
var ErrRangeIgnored = errors.New("asset: range request not honoured")

// Client fetches blobs by hash. Its http.Client has no Timeout: the caller's
// context bounds each request, and an export body can take minutes. It follows
// no redirect: asset-service never sends one, and the URL stays on the host
// taken from config.
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
	noRedirect := func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{base: u, http: &http.Client{CheckRedirect: noRedirect}}, nil
}

// Open returns the blob's bytes from offset to its end. The caller closes it.
func (c *Client) Open(ctx context.Context, hash string, offset int64) (io.ReadCloser, error) {
	u := c.base.Clone()
	u.Path = "/assets/" + hash
	u.RawPath = "/assets/" + url.PathEscape(hash)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("asset: request: %w", err)
	}
	from := strconv.FormatInt(offset, 10) + "-"
	req.Header.Set("Range", "bytes="+from)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("asset: get: %w", err)
	}
	switch resp.StatusCode {
	case http.StatusPartialContent:
		if cr := resp.Header.Get("Content-Range"); !strings.HasPrefix(cr, "bytes "+from) {
			_ = resp.Body.Close()
			return nil, fmt.Errorf("%w: asked bytes=%s, got Content-Range %q", ErrRangeIgnored, from, cr)
		}
		return resp.Body, nil
	case http.StatusOK:
		_ = resp.Body.Close()
		return nil, ErrRangeIgnored
	default:
		_ = resp.Body.Close()
		return nil, fmt.Errorf("asset: get %s: status %d", hash, resp.StatusCode)
	}
}
