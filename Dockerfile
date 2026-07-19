FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY bin ./bin
COPY lib ./lib
COPY fixtures ./fixtures
COPY examples ./examples

ENTRYPOINT ["node", "bin/github-actions-gate.js"]
