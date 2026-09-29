FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14.2.6
COPY --from=builder /app/dist ./dist
ENV PORT=3080
EXPOSE 3080
CMD ["serve", "-s", "dist", "-l", "3080"]
