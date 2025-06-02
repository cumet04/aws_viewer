#!/bin/bash

# USAGE: aws-vault exec {profile} -- bin/start.sh

set -euo pipefail

cd $(dirname "$0")/..

IMAGE_TAG=aws_viewer:$(git rev-parse --short HEAD)
CONTAINER_NAME=aws_viewer_container
PORT=20080

# ビルドまだしてなければやる
if [ -z "$(docker image ls -q $IMAGE_TAG)" ]; then
  docker build -t $IMAGE_TAG .
fi

# コンテナがあれば消しておく
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
  docker rm -f $CONTAINER_NAME > /dev/null
fi

# aws-vault exec profile -- docker run -e AWS_REGION -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN image command
docker run -d -p $PORT:3000 --name $CONTAINER_NAME \
  -e AWS_REGION -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
  -e CLUSTER_NAME -e LOG_GROUP_NAME \
  $IMAGE_TAG

echo "open http://localhost:$PORT"
# FIXME: いい感じにブラウザが自動で開いたほうが嬉しいが、MacとLinux(というかWSL)をいい感じにするのが面倒なのでやってない
