SERVICES := gateway-service catalog-service content-service auth-service twofa-service passkey-service mesh-service asset-service upload-service audit-service
MODULES  := pkg proto $(addprefix services/,$(SERVICES))
MODFILES := $(addsuffix /go.mod,$(MODULES)) $(addsuffix /go.sum,$(MODULES))

.PHONY: help build test lint fmt tidy check fmt-check tidy-check vet vuln hooks compose-up compose-down compose-logs proto-gen openapi-gen clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

build: ## Build all service binaries to ./bin/
	@mkdir -p bin
	@for svc in $(SERVICES); do \
		echo "==> building $$svc"; \
		(cd services/$$svc && go build -trimpath -o ../../../bin/ ./cmd/...) || exit 1; \
	done

test: ## Run go test -race across all modules
	@for mod in $(MODULES); do \
		echo "==> testing $$mod"; \
		(cd $$mod && go test -race -shuffle=on ./...) || exit 1; \
	done

lint: ## Run golangci-lint across all modules
	@for mod in $(MODULES); do \
		echo "==> linting $$mod"; \
		(cd $$mod && golangci-lint run ./...) || exit 1; \
	done

fmt: ## Format all Go code
	gofmt -s -w .

tidy: ## go mod tidy across all modules
	@for mod in $(MODULES); do \
		echo "==> tidying $$mod"; \
		(cd $$mod && GOWORK=off go mod tidy) || exit 1; \
	done

check: fmt-check tidy-check vet lint test vuln ## Full quality gate — what the pre-commit hook runs
	@echo "==> all checks passed"

fmt-check: ## Fail if anything is not gofmt -s clean
	@out=$$(gofmt -s -l .); \
	if [ -n "$$out" ]; then echo "not gofmt -s clean:"; echo "$$out"; echo "run: make fmt"; exit 1; fi

tidy-check: ## Fail if go mod tidy would change any go.mod/go.sum
	@before=$$(cat $(MODFILES) | cksum); \
	$(MAKE) -s tidy || exit 1; \
	after=$$(cat $(MODFILES) | cksum); \
	if [ "$$before" != "$$after" ]; then \
		echo "go.mod/go.sum were out of date — tidy just fixed them, review and stage the result"; exit 1; \
	fi

vet: ## go vet each module with the workspace OFF — catches requires missing from go.mod
	@for mod in $(MODULES); do \
		echo "==> vetting $$mod"; \
		(cd $$mod && GOWORK=off go vet ./...) || exit 1; \
	done

vuln: ## govulncheck per module (needs network for the vuln DB)
	@for mod in $(MODULES); do \
		echo "==> vulncheck $$mod"; \
		(cd $$mod && govulncheck ./...) || exit 1; \
	done

hooks: ## Point git at .githooks/ so pre-commit runs `make check`
	git -C .. config core.hooksPath .githooks
	@echo "==> hooks installed (bypass a single commit with: git commit --no-verify)"

compose-up: ## Build images and start all services (compose lives at the repo root)
	docker compose -f ../docker-compose.yml up --build -d

compose-down: ## Stop and remove all services
	docker compose -f ../docker-compose.yml down

compose-logs: ## Tail logs from all services
	docker compose -f ../docker-compose.yml logs -f

proto-gen: ## Generate Go code from .proto definitions (requires buf)
	cd proto && buf generate

openapi-gen: ## Generate Go server stubs + embedded spec from the OpenAPI spec via oapi-codegen
	cd services/gateway-service && \
		oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml && \
		oapi-codegen -config api/oapi-codegen-spec.yaml api/openapi.yaml

clean: ## Remove build artifacts
	rm -rf bin/
