SERVICES := gateway-service catalog-service mesh-service asset-service
MODULES  := pkg proto $(addprefix services/,$(SERVICES))

.PHONY: help build test lint fmt tidy compose-up compose-down compose-logs proto-gen openapi-gen clean

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
		(cd $$mod && go mod tidy) || exit 1; \
	done

compose-up: ## Build images and start all services
	docker compose up --build -d

compose-down: ## Stop and remove all services
	docker compose down

compose-logs: ## Tail logs from all services
	docker compose logs -f

proto-gen: ## Generate Go code from .proto definitions (requires buf)
	cd proto && buf generate

openapi-gen: ## Generate Go server stubs from the OpenAPI spec via oapi-codegen
	cd services/gateway-service && \
		oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml

clean: ## Remove build artifacts
	rm -rf bin/
