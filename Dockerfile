FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server ./server
USER 65534:65534
EXPOSE 8080
CMD ["node", "server/server.js"]
