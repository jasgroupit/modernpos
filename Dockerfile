FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package*.json ./
RUN npm install

# The '.' means "everything". If this fails, 'src' simply doesn't exist 
# in the same folder as this Dockerfile on GitHub.
COPY . .

ENV NODE_ENV=production
RUN mkdir -p /data
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
