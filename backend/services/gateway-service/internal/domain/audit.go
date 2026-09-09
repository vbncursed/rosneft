package domain

import "time"

// AuditEntry is one journal row as the gateway hands it to the client. OldRow
// and NewRow stay raw JSON text: the gateway has no reason to agree with any
// service on a row's shape, and the diff is computed in the browser.
type AuditEntry struct {
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
	Result      string

	// Подписи, которые журнал не хранит: они разрешаются на чтении у
	// сервисов-владельцев данных. Пустая подпись — рабочее состояние, а не
	// ошибка: сущность могли удалить, а сервис подписей мог быть недоступен.
	// Читатель в таком случае видит id, то есть ровно то, что видел раньше.
	ActorLogin    string
	CompanyLogin  string
	TerritorySlug string
}

// AuditQuery narrows a journal read. AllCompanies and CompanyID are filled in
// by the service layer from the principal — a handler must never set them from
// request parameters.
type AuditQuery struct {
	AllCompanies bool
	CompanyID    string
	ActorID      string
	Action       string
	Entity       string
	From         time.Time
	To           time.Time
	Cursor       int64
	Limit        int32

	// IncludeTotal asks the journal to count every matching row, not just the
	// page. It costs a second scan, so only a surface that pages by number
	// turns it on.
	IncludeTotal bool
}

// AuditPage is one read of the journal: the labelled rows, the cursor for
// the next page (0 = none) and, when the query asked, how many rows the
// filters match in all.
type AuditPage struct {
	Entries    []AuditEntry
	NextCursor int64
	Total      int64
}

// AuditEvent is a non-row event recorded by the gateway itself — a login, a
// logout, a password change. No trigger can see these: sessions live in Redis.
type AuditEvent struct {
	ActorID   string
	CompanyID string
	Action    string
	Entity    string
	Result    string
}

// AuditActor is one selectable option in the journal's actor filter.
type AuditActor struct {
	ID    string
	Login string
}
