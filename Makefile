.PHONY: help setup doctor download download-dry-run install dev down build test lint deploy deploy-down deploy-logs

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
	@echo "  Deploy:"
	@echo "  make deploy           Build and start PWA + Audiobookshelf via Docker Compose"
	@echo "  make deploy-down      Stop and remove deployed containers (data is preserved)"
	@echo "  make deploy-logs      Tail logs from deployed containers"
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

deploy:
	@if [ ! -f deploy/.env ]; then \
		echo "No deploy/.env found — copying from deploy/.env.example"; \
		cp deploy/.env.example deploy/.env; \
		echo "Edit deploy/.env with your settings, then run make deploy again."; \
		exit 1; \
	fi
	@set -a && . deploy/.env && set +a && \
		data_dir="$${DATA_DIR:-/srv/docker}" && \
		for sub in audiobooks ebooks podcasts metadata config; do \
			mkdir -p "$$data_dir/audiobookshelf/$$sub"; \
		done && \
		echo "Data directories verified at $$data_dir/audiobookshelf/" && \
		db="$$data_dir/audiobookshelf/config/absdatabase.sqlite" && \
		if [ -f "$$db" ]; then \
			sz=$$(wc -c < "$$db" | tr -d ' ') && \
			echo "ABS database found ($$sz bytes) — will be preserved"; \
		else \
			echo "No existing ABS database — fresh install"; \
		fi
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
	@echo ""
	@echo "Deployed:"
	@pwa_port=$$(awk -F= '/^PWA_PORT=/{print $$2}' deploy/.env); echo "  PWA:             http://localhost:$${pwa_port:-4173}"
	@abs_port=$$(awk -F= '/^ABS_PORT=/{print $$2}' deploy/.env); echo "  Audiobookshelf:  http://localhost:$${abs_port:-13378}"

deploy-down:
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env down --remove-orphans
	@echo "Containers removed. Data directories and config are preserved on the host."

deploy-logs:
	docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f
