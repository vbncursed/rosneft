.PHONY: check fmt lint test build

check: fmt lint test

fmt:
	cd src-tauri && cargo fmt --check

lint:
	cd src-tauri && cargo clippy --all-targets -- -D warnings

test:
	cd src-tauri && cargo test

build:
	yarn --cwd ../frontend build
	cd src-tauri && cargo tauri build
