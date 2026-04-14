.PHONY: help setup doctor download download-dry-run install dev down stop build test lint deploy deploy-down deploy-logs

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
	@echo "  Deploy:"
	@echo "  make deploy           Build and run the Beskar Shelf app container"
	@echo "  make deploy-down      Stop and remove the deployed app container"
	@echo "  make deploy-logs      Tail logs from the deployed app container"
	@echo ""
	@echo "  Tools:"
	@echo "  make doctor           Validate grab tools, config, links file, and output directory"
	@echo "  make download         Download and process links from links.txt"
	@echo "  make download-dry-run Fetch metadata and print the plan without downloading"

setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env"; else echo ".env already exists"; fi
	@if [ ! -f tools/grab/.env ]; then cp tools/grab/.env.example tools/grab/.env; echo "Created tools/grab/.env"; else echo "tools/grab/.env already exists"; fi
	@if [ ! -f tools/grab/links.txt ]; then cp tools/grab/links.txt.example tools/grab/links.txt; echo "Created tools/grab/links.txt"; else echo "tools/grab/links.txt already exists"; fi

install:
	@npm install

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

doctor:
	@./tools/grab/grab --doctor

download:
	@./tools/grab/grab

download-dry-run:
	@./tools/grab/grab --dry-run

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
