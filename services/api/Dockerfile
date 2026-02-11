FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV NODE_ENV=production \
    USE_DEMO_DATA=true \
    API_PORT=8080
EXPOSE 8080
CMD ["npm", "run", "start"]
