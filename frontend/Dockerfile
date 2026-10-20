# Production frontend for Hostinger VPS — builds Vite app and serves with nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Prefer same-origin /api behind nginx (Hostinger). Avoid baking Render URLs.
ARG VITE_API_URL=/api
ARG VITE_GOOGLE_CLIENT_ID=140618226788-lt31psljafm1en4n3aajo054thn5kfin.apps.googleusercontent.com
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
