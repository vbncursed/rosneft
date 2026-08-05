.PHONY: check fmt lint test build

check: guard-dist fmt lint test

# tauri::generate_context!() embeds frontendDist at compile time (main.rs) and
# panics if it is missing — so cargo fmt/clippy/test all fail with an opaque
# proc-macro panic, not a helpful error, on a checkout that never built the
# frontend. Fail fast here and name the fix instead.
guard-dist:
	@test -d ../frontend/dist || (echo "error: ../frontend/dist is missing — run 'yarn --cwd ../frontend build' first (generate_context!() embeds it at compile time)" >&2; exit 1)

fmt:
	cd src-tauri && cargo fmt --check

lint:
	cd src-tauri && cargo clippy --all-targets -- -D warnings

test:
	cd src-tauri && cargo test

build:
	yarn --cwd ../frontend build
	cd src-tauri && cargo tauri build
