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

import {
	CloudWatchLogsClient,
	type FilteredLogEvent,
	paginateFilterLogEvents,
} from "@aws-sdk/client-cloudwatch-logs";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";

// ロググループ名は環境変数から取得
const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME ?? "";

// ECSタスク状態変更イベントの型定義
interface EcsTaskStateChangeEvent {
	version?: string;
	id?: string;
	"detail-type"?: string;
	source?: string;
	account?: string;
	time?: string;
	region?: string;
	detail?: {
		clusterArn?: string;
		containerInstanceArn?: string;
		containers?: Array<{
			containerArn?: string;
			lastStatus?: string;
			name?: string;
			taskArn?: string;
		}>;
		createdAt?: string;
		desiredStatus?: string;
		group?: string;
		lastStatus?: string;
		startedAt?: string;
		stoppedAt?: string;
		startedBy?: string;
		taskArn?: string;
		taskDefinitionArn?: string;
		overrides?: {
			containerOverrides?: Array<{
				name?: string;
				command?: string[];
			}>;
		};
	};
}

// 表示用データの型定義
interface DisplayEvent {
	eventId?: string;
	family?: string;
	appCommand?: string;
	startedAt?: string;
	stoppedAt?: string;
	durationSec?: number;
	prettyMessage: string;
}

// ログエントリをAPIで取得する関数
async function fetchRawEvents(
	logGroupName: string,
	limit = 200,
): Promise<FilteredLogEvent[]> {
	const client = new CloudWatchLogsClient({});

	// 全ログだと時間がかかりすぎるので、直近24hに限定
	const startTime = new Date().getTime() - 24 * 60 * 60 * 1000;

	const paginator = paginateFilterLogEvents(
		{ client },
		{
			logGroupName,
			startTime,
			limit: 50,
		},
	);

	const allEvents: FilteredLogEvent[] = [];
	for await (const page of paginator) {
		if (page.events) {
			const newEvents = [...allEvents, ...page.events];
			if (newEvents.length >= limit) {
				return newEvents.slice(0, limit);
			}
			allEvents.splice(0, allEvents.length, ...newEvents);
		}
	}

	return allEvents;
}

// 表示用データへ加工する関数
function mapEventToDisplay(event: FilteredLogEvent): DisplayEvent {
	let msgObj: EcsTaskStateChangeEvent | null = null;
	let pretty = "";

	try {
		msgObj = JSON.parse(event.message ?? "") as EcsTaskStateChangeEvent;
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

	if (msgObj?.detail) {
		const detail = msgObj.detail;

		// taskDefinitionArnからfamily名を抽出
		if (detail.taskDefinitionArn) {
			const arnParts = detail.taskDefinitionArn.split(":task-definition/");
			if (arnParts.length > 1) {
				family = arnParts[1].split(":")[0];
			}
		}

		// containerOverridesからappコンテナのコマンドを取得
		const overrides = detail.overrides?.containerOverrides;
		if (overrides) {
			const appContainer = overrides.find(
				(container) => container.name === "app",
			);
			if (appContainer?.command) {
				appCommand = appContainer.command.join(" ");
			}
		}

		// 開始・終了時刻と実行時間を計算
		startedAt = detail.startedAt;
		stoppedAt = detail.stoppedAt;

		if (startedAt && stoppedAt) {
			const startTime = new Date(startedAt).getTime();
			const stopTime = new Date(stoppedAt).getTime();
			if (!Number.isNaN(startTime) && !Number.isNaN(stopTime)) {
				durationSec = Math.round((stopTime - startTime) / 1000);
			}
		}
	}

	return {
		eventId: event.eventId,
		family,
		appCommand,
		startedAt,
		stoppedAt,
		durationSec,
		prettyMessage: pretty,
	};
}

export async function loader(args: LoaderFunctionArgs) {
	const rawEvents = await fetchRawEvents(LOG_GROUP_NAME, 200);

	// startedByが "ecs-svc/" で始まるものを除外
	const filteredEvents = rawEvents.filter((event) => {
		try {
			const msgObj = JSON.parse(event.message ?? "") as EcsTaskStateChangeEvent;
			const startedBy = msgObj?.detail?.startedBy;
			return !(
				typeof startedBy === "string" && startedBy.startsWith("ecs-svc/")
			);
		} catch {
			// パースできない場合は除外しない
			return true;
		}
	});

	const events = filteredEvents.map(mapEventToDisplay);
	return { events };
}

type LoaderData = {
	events: DisplayEvent[];
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
							<td className="border px-2 py-1 align-top">
								{event.family ?? "-"}
							</td>
							<td className="border px-2 py-1 align-top">
								{event.appCommand ?? "-"}
							</td>
							<td className="border px-2 py-1 align-top">
								{event.startedAt
									? new Date(event.startedAt).toLocaleString()
									: "-"}
							</td>
							<td className="border px-2 py-1 align-top">
								{event.stoppedAt
									? new Date(event.stoppedAt).toLocaleString()
									: "-"}
							</td>
							<td className="border px-2 py-1 align-top">
								{event.durationSec ?? "-"}
							</td>
							{/* <td className="border px-2 py-1 font-mono text-xs whitespace-pre-wrap text-left align-top">{event.prettyMessage}</td> */}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
