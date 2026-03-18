FROM node:22-alpine

# Install build dependencies for native modules (like better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for faster caching
COPY package*.json ./
RUN npm install

# Copy all source code (Make sure .dockerignore doesn't block 'src')
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/pos.db

# Ensure the data directory exists (Use Railway Dashboard to mount a Volume here)
RUN mkdir -p /data

# Build the app (Vite will now find /app/src/main.tsx)
RUN npm run build

EXPOSE 4000

# Start the application
CMD ["npm", "start"]
