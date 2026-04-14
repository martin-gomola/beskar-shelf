FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_ABS_PROXY_BASE=/abs
RUN npm run build

FROM nginx:1.27-alpine
ENV ABS_UPSTREAM=http://host.docker.internal:13378
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4173/ || exit 1
