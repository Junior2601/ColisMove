# =========================================================
#  Image du site MoveColis : build Vite, puis fichiers statiques servis par Nginx
# =========================================================
# Build sur Debian (glibc) comme GitHub Actions : les modules natifs de Vite 8 (rolldown) s'y installent sans surprise
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Les variables VITE_* sont écrites dans le code au moment du build
ARG VITE_API_URL=/api
ARG VITE_SITE_URL=
ARG VITE_GA_MEASUREMENT_ID=
ARG VITE_META_PIXEL_ID=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID \
    VITE_META_PIXEL_ID=$VITE_META_PIXEL_ID
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
