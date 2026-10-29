# Production frontend for Hostinger VPS — builds Vite app and serves with nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Set at build time, e.g. https://your.domain/api or http://IP/api
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
# Optional CDN origin for hashed assets. Leave unset to serve them from this host.
ARG VITE_ASSET_BASE=/
ENV VITE_ASSET_BASE=$VITE_ASSET_BASE
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
