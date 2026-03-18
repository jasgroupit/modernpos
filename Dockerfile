FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy everything from GitHub into /app
COPY . .

# --- DEBUG: THIS WILL SHOW THE ACTUAL FILE STRUCTURE ---
# Look at your Railway logs for the output of this command!
RUN ls -R

# Try to install and build
RUN npm install
RUN npm run build

ENV NODE_ENV=production
RUN mkdir -p /data
EXPOSE 4000
CMD ["npm", "start"]
