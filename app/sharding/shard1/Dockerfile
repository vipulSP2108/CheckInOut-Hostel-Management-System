FROM node:18-slim

WORKDIR /app

# Create a package.json to support ESM
RUN echo '{"type": "module"}' > package.json

RUN npm install express sqlite3 sqlite

COPY server.js .

EXPOSE 5000

CMD ["node", "server.js"]
