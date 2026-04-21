.PHONY: help setup doctor download download-dry-run install install-tools tools-test tools-lint dev down stop kill build test lint deploy deploy-down deploy-logs abs-token abs-descriptions optimize-pdf optimize-pdf-lossless
help:
	@echo "beskar-shelf commands"
	@echo ""
	@echo "  Development:"
	@echo "  make setup            Create .env files and book-yt-links.txt from examples when missing"
	@echo "  make install          Install frontend dependencies"
	@echo "  make dev              Run the PWA dev server"
	@echo "  make down             Stop any vite dev server started from this repo"
	@echo "  make stop             Stop the deployed app container"
	@echo "  make kill             Stop vite dev server AND the deployed container"
	@echo "  make build            Build the PWA production bundle"
	@echo "  make test             Run tests"
	@echo "  make lint             Run linter"
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
	@echo "  make download         Download and process links from book-yt-links.txt"
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
	@if [ ! -f book-yt-links.txt ]; then cp book-yt-links.txt.example book-yt-links.txt; echo "Created book-yt-links.txt"; else echo "book-yt-links.txt already exists"; fi

install:
	@npm install

dev:
	@set -a && [ -f .env ] && . ./.env; export VITE_ABS_PROXY_BASE="$${VITE_ABS_PROXY_BASE:-/abs}" && set +a && npm run dev

down:
	@# Match by binary path, not port: catches vite on any fallback port
	@# (5173, 5174, ...) while ignoring vite dev servers from other repos.
	@pids=$$(pgrep -f "$(CURDIR)/node_modules/.bin/vite" 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			kill $$pids 2>/dev/null; \
			echo "Dev server(s) stopped: $$(echo $$pids | tr '\n' ' ')"; \
		else \
			echo "No dev server running for this repo"; \
		fi

kill: down deploy-down
	@echo "Local beskar-shelf processes cleaned up."

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
	@# Resolve the *current* tip of shelf-pdf-reader's main branch on the host
	@# and hand it to the Docker build as READER_SHA. The Dockerfile runs
	@# `npm install --no-save @mgomola/shelf-pdf-reader@github:...#$$READER_SHA`
	@# in a layer that cache-busts on the SHA, so the deployed image always
	@# contains the latest reader code without needing the host's lockfile to
	@# be refreshed (and without silently failing the way the old `npm update
	@# 2>/dev/null || true` line did).
	@set -e; \
		echo "→ Resolving latest @mgomola/shelf-pdf-reader main SHA..."; \
		READER_SHA=$$(git ls-remote https://github.com/martin-gomola/shelf-pdf-reader.git main | head -n1 | cut -f1); \
		if [ -z "$$READER_SHA" ] || [ $${#READER_SHA} -ne 40 ]; then \
			echo "✗ git ls-remote returned no SHA for shelf-pdf-reader main (got: '$$READER_SHA')"; \
			exit 1; \
		fi; \
		echo "  → $$READER_SHA"; \
		LOCK_SHA=$$(grep -m1 '"resolved":.*shelf-pdf-reader\.git#' package-lock.json 2>/dev/null | sed 's/.*#\([a-f0-9]*\).*/\1/'); \
		if [ -n "$$LOCK_SHA" ] && [ "$$READER_SHA" != "$$LOCK_SHA" ]; then \
			echo "  ⚠ lockfile pins $$LOCK_SHA — Docker will pull $$READER_SHA fresh on top"; \
		fi; \
		container_name="$$(sed -n 's/^CONTAINER_NAME=//p' .env | head -n1)"; \
		container_name="$${container_name:-beskar-shelf-pwa}"; \
		docker rm -f "$$container_name" >/dev/null 2>&1 || true; \
		READER_SHA="$$READER_SHA" docker compose up -d --build
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
