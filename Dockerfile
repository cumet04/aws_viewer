FROM node:24.1.0-slim AS node_base
WORKDIR /app

FROM node_base
COPY ./package.json package-lock.json ./
RUN npm ci

COPY ./app ./app
COPY ./public ./public
COPY ./*.ts ./tsconfig.json ./
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
