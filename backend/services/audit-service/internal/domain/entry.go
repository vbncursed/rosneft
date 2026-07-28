// Package domain contains the audit service's data model — pure Go types, no
// proto, no SQL.
package domain

import "time"

// Entry is one journal row. OldRow/NewRow carry raw JSON snapshots; the diff is
// derived by the client and never stored, since it is fully determined by the
// two snapshots already here.
type Entry struct {
	ID          int64
	At          time.Time
	ActorID     string
	CompanyID   string
	Action      string
	Entity      string
	EntityID    string
	EntityLabel string
	OldRow      string
	NewRow      string
	RequestID   string
	Result      string
}

// Filter narrows a journal read.
//
// AllCompanies is the Root's blanket read; every other caller must supply
// CompanyID. The two are never both meaningful — the service refuses a scoped
// filter with an empty company rather than silently matching the NULL-company
// rows, which are exactly Root's and the system's actions.
type Filter struct {
	AllCompanies bool
	CompanyID    string
	ActorID      string
	Action       string
	Entity       string
	From         time.Time
	To           time.Time
	Cursor       int64 // exclusive upper bound on id; 0 = newest page
	Limit        int32
}
