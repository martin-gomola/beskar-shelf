.PHONY: help setup doctor download download-dry-run pwa-install pwa-dev pwa-build pwa-test

help:
	@echo "beskar-shelf commands"
	@echo "  make setup            Create .env and links.txt from examples when missing"
	@echo "  make doctor           Validate tools, config, links file, and output directory"
	@echo "  make download         Download and process links from links.txt"
	@echo "  make download-dry-run Fetch metadata and print the plan without downloading"
	@echo "  make pwa-install      Install frontend dependencies"
	@echo "  make pwa-dev          Run the PWA dev server"
	@echo "  make pwa-build        Build the PWA production bundle"
	@echo "  make pwa-test         Run PWA tests and lint"

setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env"; else echo ".env already exists"; fi
	@if [ ! -f links.txt ]; then cp links.txt.example links.txt; echo "Created links.txt"; else echo "links.txt already exists"; fi

doctor:
	@./bin/grab --doctor

download:
	@./bin/grab

download-dry-run:
	@./bin/grab --dry-run

pwa-install:
	@cd apps/pwa && npm install

pwa-dev:
	@cd apps/pwa && set -a && . ../../.env && export VITE_ABS_PROXY_BASE="$${VITE_ABS_PROXY_BASE:-/abs}" && set +a && npm run dev

pwa-build:
	@cd apps/pwa && npm run build

pwa-test:
	@cd apps/pwa && npm run lint && npm run test
