# Multi-stage build for production-grade TypeScript Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy packages and prisma definitions
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for compiling)
RUN npm ci

# Copy codebase
COPY . .

# Run prisma generate and build TypeScript code
RUN npm run build

# Remove development dependencies to keep production image tiny
RUN npm prune --production

# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy production artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose backend port
EXPOSE 8000

# Start the application
CMD ["node", "dist/index.js"]
