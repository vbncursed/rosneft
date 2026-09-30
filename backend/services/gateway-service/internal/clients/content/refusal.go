package content

import (
	"fmt"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// refusal is a write content refused, told from its sentinel on ("invalid
// input: …", "panorama not found"). The handler puts Error() in the 4xx body;
// content's mapError leaves its layers' "service.X: " prefixes in the status
// message, and those must not reach the browser. Unwrap names the sentinel for
// the HTTP status.
type refusal struct {
	msg      string
	sentinel error
}

func (r refusal) Error() string { return r.msg }

func (r refusal) Unwrap() error { return r.sentinel }

// editRefusal maps a failed content write. NotFound is the panorama, or the
// territory when the message names it; InvalidArgument is bad input. Anything
// else is wrapped with op, for the log, as an internal error.
func editRefusal(op string, err error) error {
	st, ok := status.FromError(err)
	if !ok {
		return fmt.Errorf("%s: %w", op, err)
	}
	var sentinel error
	switch st.Code() {
	case codes.NotFound:
		sentinel = domain.ErrPanoramaNotFound
		if strings.Contains(st.Message(), domain.ErrTerritoryNotFound.Error()) {
			sentinel = domain.ErrTerritoryNotFound
		}
	case codes.InvalidArgument:
		sentinel = domain.ErrInvalidInput
	default:
		return fmt.Errorf("%s: %w", op, err)
	}
	msg := st.Message()
	if i := strings.Index(msg, sentinel.Error()); i >= 0 {
		msg = msg[i:]
	}
	return refusal{msg, sentinel}
}
