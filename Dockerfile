FROM node:24.1.0-slim AS node_base
WORKDIR /app

FROM node_base AS development-dependencies-env
COPY ./package.json package-lock.json /app/
RUN npm ci

FROM node_base AS production-dependencies-env
COPY ./package.json package-lock.json /app/
RUN npm ci --omit=dev

FROM node_base AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
RUN npm run build

FROM node_base
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
CMD ["npm", "run", "start"]
