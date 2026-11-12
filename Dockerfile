FROM oven/bun:1-alpine
WORKDIR /app
COPY . .
ENV PORT=3000
ENV PUBLIC_DIR=./public
EXPOSE 3000
CMD ["bun", "server.js"]
