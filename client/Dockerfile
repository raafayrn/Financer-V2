# Frontend — build com Vite, servido por nginx
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# Em produção usamos caminho relativo /api (nginx faz o proxy).
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
