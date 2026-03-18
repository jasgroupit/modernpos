FROM node:22-alpine

# 1. Build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 2. Copy and install
COPY package*.json ./
RUN npm install

# 3. Copy source
COPY . .

# --- CRITICAL FIX: Ensure the directory structure is flat ---
# If your files are inside a subfolder, move them to /app
RUN if [ -d "src" ]; then echo "Src found"; else cp -r */src . 2>/dev/null || true; fi
RUN if [ -f "index.html" ]; then echo "HTML found"; else cp */index.html . 2>/dev/null || true; fi

# 4. Environment Variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/pos.db
ENV PORT=4000

# 5. Build the app 
# We use --emptyOutDir to clear any old junk
RUN npm run build

# 6. Setup data dir (Railway Volume goes here)
RUN mkdir -p /data

EXPOSE 4000

CMD ["npm", "start"]
