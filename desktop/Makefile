.PHONY: check typecheck lint fmt-check test dev build

check: typecheck lint fmt-check test

typecheck:
	yarn typecheck

lint:
	yarn lint

fmt-check:
	yarn fmt:check

test:
	yarn test

# DESKTOP_UPSTREAM=http://localhost:3000 make dev — a local Vite; the profile
# moves to <userData>-dev so it never touches the installed app's session.
dev:
	yarn dev

build:
	yarn dist
