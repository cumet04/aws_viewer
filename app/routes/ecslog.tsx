// ## ページ仕様:
// AWS APIを使い、Cloudwatch Logsに記録されたECSタスク終了イベントの一覧を表示する
// 
// ### データ取得方法
// - 指定したロググループに "detail-type": "ECS Task State Change" のイベントが記録されていることを前提とする
// - ロググループ名は環境変数LOG_GROUP_NAMEから取得する
// - ログエントリは直近24時間分とする
// - ログエントリのうち、startedByが "ecs-svc/" で始まるものは除外する
//
// ### 表示内容
// 下記をtable表示する。スタイルは一旦はごくシンプルなものとする。
// - タスク定義のfamily名
// - containerOverridesにあるappコンテナの実行コマンド
// - タスクの開始時刻
// - タスクの終了時刻とタスク実行にかかった時間 (開始-終了)
// - ログエントリの"message"フィールドをJSON pretty printしたもの

import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { CloudWatchLogsClient, FilterLogEventsCommand, type FilterLogEventsCommandOutput } from "@aws-sdk/client-cloudwatch-logs";

// ロググループ名は環境変数から取得
const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME ?? "";

// ログエントリをAPIで取得する関数
async function fetchRawEvents(logGroupName: string, limit: number = 200) {
  const client = new CloudWatchLogsClient({});
  let nextToken: string | undefined = undefined;
  const rawEvents: any[] = [];
  
  // 全ログだと時間がかかりすぎるので、直近24hに限定
  const startTime = new Date().getTime() - (24 * 60 * 60 * 1000);
  
  do {
    const res: FilterLogEventsCommandOutput = await client.send(
      new FilterLogEventsCommand({
        logGroupName,
        startTime,
        nextToken,
        limit: 50,
      })
    );
    if (res.events) rawEvents.push(...res.events);
    nextToken = res.nextToken;
    if (rawEvents.length >= limit) break;
  } while (nextToken);
  return rawEvents;
}

// 表示用データへ加工する関数
function mapEventToDisplay(event: any) {
  let msgObj: any = null;
  let pretty = "";
  try {
    msgObj = JSON.parse(event.message ?? "");
    pretty = JSON.stringify(msgObj, null, 2);
  } catch {
    pretty = event.message ?? "";
  }
  // family名
  let family: string | undefined = undefined;
  // appコンテナのコマンド
  let appCommand: string | undefined = undefined;
  // 開始・終了時刻
  let startedAt: string | undefined = undefined;
  let stoppedAt: string | undefined = undefined;
  let durationSec: number | undefined = undefined;
  if (msgObj) {
    family = msgObj.detail?.taskDefinitionArn?.split(":task-definition/")[1]?.split(":")[0];
    const overrides = msgObj.detail?.overrides?.containerOverrides;
    if (Array.isArray(overrides)) {
      const app = overrides.find((c: any) => c.name === "app");
      if (app && Array.isArray(app.command)) {
        appCommand = app.command.join(" ");
      }
    }
    startedAt = msgObj.detail?.startedAt;
    stoppedAt = msgObj.detail?.stoppedAt;
    if (startedAt && stoppedAt) {
      const start = new Date(startedAt).getTime();
      const stop = new Date(stoppedAt).getTime();
      if (!isNaN(start) && !isNaN(stop)) {
        durationSec = Math.round((stop - start) / 1000);
      }
    }
  }
  return { eventId: event.eventId, family, appCommand, startedAt, stoppedAt, durationSec, prettyMessage: pretty };
}

export async function loader(args: LoaderFunctionArgs) {
  const rawEvents = await fetchRawEvents(LOG_GROUP_NAME, 200);
  // startedByが "ecs-svc/" で始まるものを除外
  const filtered = rawEvents.filter(event => {
    try {
      const msgObj = JSON.parse(event.message ?? "");
      const startedBy = msgObj?.detail?.startedBy;
      return !(typeof startedBy === "string" && startedBy.startsWith("ecs-svc/"));
    } catch {
      // パースできない場合は除外しない
      return true;
    }
  });
  const events = filtered.map(mapEventToDisplay);
  return { events };
}

type LoaderData = {
  events: Array<{
    eventId?: string;
    family?: string;
    appCommand?: string;
    startedAt?: string;
    stoppedAt?: string;
    durationSec?: number;
    prettyMessage: string;
  }>;
};

export default function Ecslog() {
  const { events } = useLoaderData() as LoaderData;
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">ECSタスク終了イベント一覧</h1>
      <table className="min-w-full border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1">#</th>
            <th className="border px-2 py-1">family</th>
            <th className="border px-2 py-1">appコマンド</th>
            <th className="border px-2 py-1">開始時刻</th>
            <th className="border px-2 py-1">終了時刻</th>
            <th className="border px-2 py-1">実行時間(s)</th>
            <th className="border px-2 py-1">message(JSON)</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, idx) => (
            <tr key={event.eventId ?? idx}>
              <td className="border px-2 py-1 align-top">{idx + 1}</td>
              <td className="border px-2 py-1 align-top">{event.family ?? "-"}</td>
              <td className="border px-2 py-1 align-top">{event.appCommand ?? "-"}</td>
              <td className="border px-2 py-1 align-top">{event.startedAt ? new Date(event.startedAt).toLocaleString() : "-"}</td>
              <td className="border px-2 py-1 align-top">{event.stoppedAt ? new Date(event.stoppedAt).toLocaleString() : "-"}</td>
              <td className="border px-2 py-1 align-top">{event.durationSec ?? "-"}</td>
              {/* <td className="border px-2 py-1 font-mono text-xs whitespace-pre-wrap text-left align-top">{event.prettyMessage}</td> */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
