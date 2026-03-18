FROM node:22-alpine

# 1. Build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 2. Install dependencies
COPY package*.json ./
RUN npm install

# 3. Copy everything else
COPY . .

# --- DEBUG STEP: This will show you exactly what files are in the container ---
RUN ls -R /app/src && ls -al /app/index.html

# 4. Environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/pos.db
# Railway usually provides the PORT, but we set a default
ENV PORT=4000 

# 5. Build the app
RUN npm run build

# 6. Setup persistent data folder (No VOLUME command to avoid Railway error)
RUN mkdir -p /data

EXPOSE 4000

CMD ["npm", "start"]
