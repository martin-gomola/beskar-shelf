FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
COPY package*.json ./
RUN sed -i 's|git+ssh://git@github.com/|git+https://github.com/|g' package-lock.json
RUN npm ci
COPY . .
ARG VITE_APP_NAME="Beskar Shelf"
ARG VITE_DEFAULT_SERVER_URL=""
ARG VITE_ABS_PROXY_BASE="/abs"
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_DEFAULT_SERVER_URL=${VITE_DEFAULT_SERVER_URL}
ENV VITE_ABS_PROXY_BASE=${VITE_ABS_PROXY_BASE}
RUN npm run build

FROM nginx:1.27-alpine
ENV ABS_UPSTREAM=http://host.docker.internal:13378
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4173/ || exit 1
