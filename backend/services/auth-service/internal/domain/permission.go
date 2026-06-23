package domain

// Permission is a single capability guarding a real endpoint.
type Permission struct {
	Slug        string
	Description string
}
