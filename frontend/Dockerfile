# Desarrollo: Vite con proxy a /api. Producción: se compila a estáticos (ver ../docker-compose.prod.yml).
FROM node:24-trixie-slim AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_MAP_STYLE_URL
ENV VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL
RUN npm run build
