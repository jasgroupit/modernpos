FROM node:22-alpine

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for tsx and build tools)
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/pos.db

# Create data directory for persistent storage
RUN mkdir -p /data
VOLUME /data

# Expose the port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
