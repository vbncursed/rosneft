package domain

// AuditPrincipal is who is asking for the journal. It is assembled from the
// session by the transport layer and never from request parameters.
type AuditPrincipal struct {
	IsOwner bool
	UserID  string
	Company string
	Perms   []string
}

// AuditScope is what that principal may read.
//
// Actor, when set, pins the read to one person and OVERWRITES whatever actor
// filter the request carried — a caller narrowed to their own actions must not
// be able to widen the filter back out by hand.
type AuditScope struct {
	All     bool
	Company string
	Actor   string
}
