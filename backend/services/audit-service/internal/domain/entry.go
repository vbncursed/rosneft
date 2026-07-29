// Package domain contains the audit service's data model — pure Go types, no
// proto, no SQL.
package domain

import "time"

// Entry is one journal row. OldRow/NewRow carry raw JSON snapshots; the diff is
// derived by the client and never stored, since it is fully determined by the
// two snapshots already here.
//
// The JSON tags name the audit_log columns rather than the Go fields. Nothing
// in the gRPC path marshals this type — transport converts field by field — but
// `audit export` writes it straight to JSONL, and an archive whose keys match
// the table is one an operator can load back without a translation step.
type Entry struct {
	ID          int64     `json:"id"`
	At          time.Time `json:"at"`
	ActorID     string    `json:"actor_id"`
	CompanyID   string    `json:"company_id"`
	Action      string    `json:"action"`
	Entity      string    `json:"entity"`
	EntityID    string    `json:"entity_id"`
	EntityLabel string    `json:"entity_label"`
	OldRow      string    `json:"old_row"`
	NewRow      string    `json:"new_row"`
	RequestID   string    `json:"request_id"`
	Result      string    `json:"result"`
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
