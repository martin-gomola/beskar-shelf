FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
COPY package*.json ./
RUN sed -i 's|git+ssh://git@github.com/|git+https://github.com/|g' package-lock.json
RUN npm ci
# Force a fresh pull of @mgomola/shelf-pdf-reader on top of whatever the
# lockfile pinned. The Makefile resolves the current main SHA on the host
# via `git ls-remote` and passes it as READER_SHA so this layer cache-busts
# precisely when (and only when) main moves. --no-save means we don't try
# to mutate the lockfile inside the container — npm ci above already gave
# us a coherent tree, this just upgrades the one package we want fresh.
ARG READER_SHA=main
RUN npm install --no-save \
    @mgomola/shelf-pdf-reader@github:martin-gomola/shelf-pdf-reader#${READER_SHA}
COPY . .
ARG VITE_APP_NAME="Beskar Shelf"
ARG VITE_DEFAULT_SERVER_URL=""
ARG VITE_ABS_PROXY_BASE="/abs"
# Optional public demo credentials. These get inlined into the JS bundle
# at build time and are visible to any client, so ONLY use them for the
# public audiobooks.dev demo (user "demo" / password "demo"). Never set
# these to real credentials.
ARG VITE_DEMO_USERNAME=""
ARG VITE_DEMO_PASSWORD=""
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_DEFAULT_SERVER_URL=${VITE_DEFAULT_SERVER_URL}
ENV VITE_ABS_PROXY_BASE=${VITE_ABS_PROXY_BASE}
ENV VITE_DEMO_USERNAME=${VITE_DEMO_USERNAME}
ENV VITE_DEMO_PASSWORD=${VITE_DEMO_PASSWORD}
RUN npm run build

FROM nginx:1.27-alpine
ENV ABS_UPSTREAM=http://host.docker.internal:13378
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4173/ || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
