package domain

// VerifyResult is the outcome of recomputing the checkpoint chain.
//
// FailedID names the checkpoint that did not reproduce; Reason says how. Only
// the first failure is reported: past it every later checkpoint fails too,
// because the chain folds its predecessor in, and a wall of derived failures
// would bury the one that matters.
type VerifyResult struct {
	Checked  int
	OK       bool
	FailedID int64
	Reason   string
}
