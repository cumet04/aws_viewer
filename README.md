# aws_viewer

このリポジトリは、自分用の「閲覧専用のbetter AWSマネコン」です。
汎用性よりも必要な情報の取得速度を重視し、ECSタスクの情報表示に特化しています。

## 概要

ECSタスクの情報を素早く確認するためのツールです。表示内容や機能は、個人の利用目的に合わせて最小限に絞っています。

## 設定について

アプリケーションの利用には、`app/config/environments.json` に環境情報を記載する必要があります。複数の環境（本番やstagingなど）を切り替えて利用できるよう、`"env"` を複数用意できます。

各属性の説明は以下の通りです。

- `cluster_name`: 対象とするECSクラスターの名前を指定します。
- `main_container`: ECSタスク内でメインとなるアプリケーションのコンテナ名を指定します。これは一覧表示やデフォルトのログ表示に利用されます。
- `log_group_name`: 終了したECSタスクのイベントログを格納するCloudWatch Logsのロググループ名を指定します。このロググループは事前に用意しておく必要があります。

EventBridgeからCloudWatch Logsへ、以下のイベントパターンでイベントを転送する設定を行ってください。

```json
{
  "source": ["aws.ecs"],
  "detail-type": ["ECS Task State Change"],
  "detail": {
    "lastStatus": ["STOPPED"],
    "clusterArn": ["(対象のECSクラスターARN)"]
  }
}
```

## 利用方法

利用者向けにはDockerfileと、ビルド・起動用のスクリプト（`bin/start.sh`）を用意しています。AWSの認証情報が利用できる状態で `bin/start.sh` を実行することで、アプリケーションを起動できます。
