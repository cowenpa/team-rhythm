FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build
FROM node:22-alpine
RUN apk add --no-cache poppler-utils
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY fixtures/import-tests ./fixtures/import-tests
COPY output/pdf/sample-email-chains.pdf ./output/pdf/sample-email-chains.pdf
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node","server/index.js"]
