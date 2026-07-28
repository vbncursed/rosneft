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
