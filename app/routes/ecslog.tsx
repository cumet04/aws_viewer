import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { filterLogEvents, type EcsTaskStateChangeEvent } from "~/aws";

// ロググループ名は環境変数から取得
const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME ?? "";

// 表示用データの型定義
interface DisplayEvent {
	eventId: string;
	family: string;
	appCommand?: string;
	startedAt: Date;
	stoppedAt: Date;
	durationSec?: number;
	prettyMessage: string;
}

// 表示用データへ加工する関数
function mapEventToDisplay(e: EcsTaskStateChangeEvent): DisplayEvent {
	const detail = e.detail;

	// containerOverridesからappコンテナのコマンドを取得
	let appCommand: string | undefined = undefined;
	const overrides = detail.overrides?.containerOverrides;
	if (overrides) {
		const appContainer = overrides.find(
			(container) => container.name === "app",
		);
		if (appContainer?.command) {
			appCommand = appContainer.command.join(" ");
		}
	}

	const startedAt = detail.startedAt!;
	const stoppedAt = detail.stoppedAt!;

	const durationSec = Math.round(
		(new Date(stoppedAt).getTime() - new Date(startedAt).getTime()) / 1000,
	);

	return {
		eventId: e.id,
		family: detail.group!,
		appCommand,
		startedAt,
		stoppedAt,
		durationSec,
		prettyMessage: JSON.stringify(e),
	};
}

export async function loader(args: LoaderFunctionArgs) {
	const rawEvents = (
		await filterLogEvents(
			LOG_GROUP_NAME,
			Date.now() - 24 * 60 * 60 * 1000, // 直近24時間分のログを取得
		)
	).map((log) => JSON.parse(log.message!) as EcsTaskStateChangeEvent);

	// startedByが "ecs-svc/" で始まるものを除外
	const filteredEvents = rawEvents.filter((event) => {
		return !event.detail.startedBy?.startsWith("ecs-svc/");
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
								{event.startedAt ? event.startedAt.toLocaleString() : "-"}
							</td>
							<td className="border px-2 py-1 align-top">
								{event.stoppedAt ? event.stoppedAt.toLocaleString() : "-"}
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
