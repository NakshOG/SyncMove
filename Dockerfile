# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for mediasoup worker compilation
RUN apk add --no-cache python3 make g++ py3-pip

# Install pip modules needed by mediasoup
RUN pip3 install --break-system-packages pip setuptools wheel

# Install dependencies first, including Prisma schema support
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and build the app
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=local

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy app artifacts needed for runtime
COPY --from=builder /app/package*.json ./
# `public/` is optional in Next.js. This project currently has no public
# directory, so do not make the production image depend on one existing.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
