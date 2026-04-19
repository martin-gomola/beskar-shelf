.PHONY: help setup doctor download download-dry-run install install-tools tools-test tools-lint dev down stop build test lint deploy deploy-down deploy-logs abs-token abs-descriptions optimize-pdf optimize-pdf-lossless update-reader

help:
	@echo "beskar-shelf commands"
	@echo ""
	@echo "  Development:"
	@echo "  make setup            Create .env files and links.txt from examples when missing"
	@echo "  make install          Install frontend dependencies"
	@echo "  make dev              Run the PWA dev server"
	@echo "  make down             Stop the PWA dev server if it is running"
	@echo "  make stop             Stop the deployed app container"
	@echo "  make build            Build the PWA production bundle"
	@echo "  make test             Run tests"
	@echo "  make lint             Run linter"
	@echo ""
	@echo "  Dependencies:"
	@echo "  make update-reader    Pull latest shelf-pdf-reader from GitHub and commit lockfile"
	@echo ""
	@echo "  Deploy:"
	@echo "  make deploy           Build and run the Beskar Shelf app container"
	@echo "  make deploy-down      Stop and remove the deployed app container"
	@echo "  make deploy-logs      Tail logs from the deployed app container"
	@echo ""
	@echo "  Tools:"
	@echo "  make install-tools    Create tools/.venv and install beskar-tools (editable)"
	@echo "  make tools-test       Run beskar-tools pytest suite"
	@echo "  make tools-lint       Run ruff over beskar-tools"
	@echo "  make doctor           Validate grab tools, config, links file, and output directory"
	@echo "  make download         Download and process links from links.txt"
	@echo "  make download-dry-run Fetch metadata and print the plan without downloading"
	@echo "  make abs-token        Prompt for ABS credentials and print an API token"
	@echo "  make abs-descriptions Export books with missing ABS descriptions to JSON"
	@echo "  make optimize-pdf PDF=<path> [QUALITY=85] [OUT=<output.pdf>]"
	@echo "                        Lossy compress + linearise (typical 60-90% smaller). Default Q=85."
	@echo "  make optimize-pdf-lossless PDF=<path> [OUT=<output.pdf>]"
	@echo "                        qpdf-only: object-stream pack + linearise. Visually identical."

setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env"; else echo ".env already exists"; fi
	@if [ ! -f tools/grab/.env ]; then cp tools/grab/.env.example tools/grab/.env; echo "Created tools/grab/.env"; else echo "tools/grab/.env already exists"; fi
	@if [ ! -f tools/grab/links.txt ]; then cp tools/grab/links.txt.example tools/grab/links.txt; echo "Created tools/grab/links.txt"; else echo "tools/grab/links.txt already exists"; fi

install:
	@npm install

update-reader:
	@echo "Pulling latest @mgomola/shelf-pdf-reader from GitHub..."
	@npm update @mgomola/shelf-pdf-reader
	@git add package-lock.json
	@git commit -m "deps: bump shelf-pdf-reader to $$(node -p \"require('./node_modules/@mgomola/shelf-pdf-reader/package.json').version\")"
	@echo "Done. Run 'make deploy' to ship it."

dev:
	@set -a && [ -f .env ] && . ./.env; export VITE_ABS_PROXY_BASE="$${VITE_ABS_PROXY_BASE:-/abs}" && set +a && npm run dev

down:
	@pid=$$(lsof -ti :5173 2>/dev/null || true); \
		if [ -n "$$pid" ]; then \
			kill $$pid && echo "Dev server stopped (pid $$pid)"; \
		else \
			echo "No dev server running on port 5173"; \
		fi

build:
	@npm run build

test:
	@npm run test

lint:
	@npm run lint

install-tools:
	@cd tools && \
		if [ ! -d .venv ]; then \
			python3 -m venv .venv && echo "Created tools/.venv"; \
		fi && \
		./.venv/bin/pip install --upgrade pip >/dev/null && \
		./.venv/bin/pip install -e ".[dev]"

tools-test:
	@cd tools && ./.venv/bin/pytest tests

tools-lint:
	@cd tools && ./.venv/bin/ruff check beskar_tools tests

doctor:
	@./tools/grab/grab --doctor

download:
	@./tools/grab/grab

download-dry-run:
	@./tools/grab/grab --dry-run

abs-token:
	@ABS_USERNAME_INPUT="" ABS_PASSWORD_INPUT="" ./tools/get-abs-token

abs-descriptions:
	@./tools/fill-abs-descriptions --export-missing descriptions.todo.json

optimize-pdf:
	@if [ -z "$(PDF)" ]; then \
		echo "Usage: make optimize-pdf PDF=<path/to/book.pdf> [QUALITY=85] [OUT=<output.pdf>]"; \
		echo ""; \
		echo "Re-encodes embedded raster images as JPEG quality=N (default 85) and"; \
		echo "linearises the result. Typical 60-90% smaller for image-heavy art books,"; \
		echo "5-15% on text-mostly PDFs (still wins from linearisation for streaming)."; \
		exit 2; \
	fi
	@./tools/optimize-pdf "$(PDF)" \
		$(if $(QUALITY),--quality $(QUALITY)) \
		$(if $(OUT),--output "$(OUT)")

optimize-pdf-lossless:
	@if [ -z "$(PDF)" ]; then \
		echo "Usage: make optimize-pdf-lossless PDF=<path/to/book.pdf> [OUT=<output.pdf>]"; \
		echo ""; \
		echo "qpdf-only: object-stream packing + linearisation. Visually identical to"; \
		echo "the source. Modest size win (~5-15%), but linearisation lets the ABS"; \
		echo "reader render page 1 without downloading the entire file."; \
		exit 2; \
	fi
	@./tools/optimize-pdf "$(PDF)" --lossless \
		$(if $(OUT),--output "$(OUT)")

deploy:
	@if [ ! -f .env ]; then \
		echo "No .env found — copying from .env.example"; \
		cp .env.example .env; \
		echo "Edit .env with your app and runtime settings, then run make deploy again."; \
		exit 1; \
	fi
	@container_name="$$(sed -n 's/^CONTAINER_NAME=//p' .env | head -n1)"; \
		container_name="$${container_name:-beskar-shelf-pwa}" && \
		docker rm -f "$$container_name" >/dev/null 2>&1 || true
	docker compose up -d --build
	@echo ""
	@container_name="$$(sed -n 's/^CONTAINER_NAME=//p' .env | head -n1)"; \
		image_name="$$(sed -n 's/^IMAGE_NAME=//p' .env | head -n1)"; \
		app_port="$$(sed -n 's/^APP_PORT=//p' .env | head -n1)"; \
		abs_upstream="$$(sed -n 's/^ABS_UPSTREAM=//p' .env | head -n1)"; \
		echo "Deployed:" && \
		echo "  Container:       $${container_name:-beskar-shelf-pwa}" && \
		echo "  Image:           $${image_name:-beskar-shelf}" && \
		echo "  Beskar Shelf:    http://localhost:$${app_port:-4173}" && \
		echo "  ABS upstream:    $${abs_upstream:-http://host.docker.internal:13378}"

deploy-down:
	docker compose down

stop: deploy-down

deploy-logs:
	docker compose logs -f
