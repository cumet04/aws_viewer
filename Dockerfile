FROM node:24.1.0-slim AS node_base
WORKDIR /app

FROM node_base AS development-dependencies-env
COPY ./package.json package-lock.json /app/
RUN npm config set fetch-retry-maxtimeout 120000
RUN npm config set fetch-retry-mintimeout 60000  
RUN npm ci

FROM node_base
COPY ./package.json package-lock.json /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
COPY . /app/
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
