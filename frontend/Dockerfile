# Multi-stage build for React Vite Frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy packages
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy codebase
COPY . .

# Build application
RUN npm run build

# Nginx Stage for serving static files
FROM nginx:alpine

# Copy custom Nginx configuration to support SPA routing and reverse-proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
