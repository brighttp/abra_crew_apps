FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY client ./client
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /app/server/uploads && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["npm","start"]
