.PHONY: help setup doctor download download-dry-run install dev down build test lint

help:
	@echo "beskar-shelf commands"
	@echo ""
	@echo "  Development:"
	@echo "  make setup            Create .env files and links.txt from examples when missing"
	@echo "  make install          Install frontend dependencies"
	@echo "  make dev              Run the PWA dev server"
	@echo "  make down             Stop the PWA dev server"
	@echo "  make build            Build the PWA production bundle"
	@echo "  make test             Run tests"
	@echo "  make lint             Run linter"
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
	@pid=$$(lsof -ti :5173 2>/dev/null) && \
		if [ -n "$$pid" ]; then kill $$pid && echo "Dev server stopped (pid $$pid)"; \
		else echo "No dev server running on port 5173"; fi

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
