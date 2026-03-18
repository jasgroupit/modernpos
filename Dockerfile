FROM node:22-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# --- FORCE COPY SPECIFIC FOLDERS ---
# This ignores .dockerignore settings for these specific paths
COPY src/ ./src/
COPY index.html ./index.html
COPY vite.config.ts ./vite.config.ts
COPY tsconfig*.json ./ 
# Copy the rest just in case
COPY . .

# DEBUG: This will print the file structure to your Railway logs
RUN ls -R /app/src

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/pos.db

# Ensure data directory exists
RUN mkdir -p /data

# Build
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
