FROM node:22-alpine

# 1. Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 2. Copy package files and install ALL deps (Vite needs devDeps to build)
COPY package*.json ./
RUN npm install

# 3. Copy EVERYTHING else (Ensures /src/main.tsx is available for Vite)
COPY . .

# 4. Set environment variables BEFORE the build
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/pos.db

# 5. Build the frontend (This now has access to the /src folder)
RUN npm run build

# 6. Create data directory (Railway will mount the Volume here)
# We do NOT use the "VOLUME" command here to avoid the Railway error.
RUN mkdir -p /data && chown -R node:node /data

# 7. Switch to a non-root user for security (optional but recommended)
USER node

EXPOSE 4000

# 8. Start the application
CMD ["npm", "start"]
