FROM node:24.1.0-slim AS node_base
WORKDIR /app

FROM node_base
COPY ./package.json package-lock.json ./
RUN npm ci

# 諸事情により、Dockerコンテナ内でもproduction buildではなくdev serverを起動する。 refs #19
# なお、configをコンテナ内に埋め込むかたちになっているので、いずれにせよイメージの配布やクラウド運用はできない状態。

COPY ./app ./app
COPY ./public ./public
COPY ./*.ts ./tsconfig.json ./
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
