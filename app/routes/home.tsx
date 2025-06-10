import type { Task } from "@aws-sdk/client-ecs";
import {
	type LoaderFunctionArgs,
	useLoaderData,
	Link,
	type HeadersArgs,
} from "react-router";
import {
	describeTasks,
	filterLogEvents,
	listEcsTaskArns,
	parseEcsTaskStateChangeEvent,
	storeFinishedTasks,
} from "~/aws";
import { getCurrentEnvironmentConfig } from "~/config/environment";

export async function loader({
	request,
}: LoaderFunctionArgs): Promise<LoaderData> {
	const envConfig = getCurrentEnvironmentConfig();

	const from = Date.now() - 24 * 60 * 60 * 1000; // 直近24時間分。ただちょっと多すぎてページ重いので、できればpaginateとかしたい

	return {
		currentTasks: await currentTasks(envConfig.cluster_name),
		finishedTasks: await finishedTasks(envConfig.log_group_name, from),
		clusterName: envConfig.cluster_name,
	};
}

export function headers(_: HeadersArgs) {
	// このページ、というかfilterLogEventsがやたら遅いので、主に一覧と詳細を往復するときのストレス軽減としてキャッシュを設定
	return { "Cache-Control": "max-age=300" };
}

async function currentTasks(clusterName: string) {
	const arns = await listEcsTaskArns(clusterName);
	const tasks = await describeTasks(arns);
	return tasks.map(toCurrentTaskView);
}

async function finishedTasks(logName: string, from: number) {
	const finishedTasks = (await filterLogEvents(logName, from))
		.map((log) => parseEcsTaskStateChangeEvent(log.message!).detail)
		.filter((task) => !task.startedBy?.startsWith("ecs-svc/"))
		.reverse();
	storeFinishedTasks(finishedTasks);
	return finishedTasks.map(toFinishedTaskView);
}

type CurrentTaskView = {
	taskId: string;
	startedAt: Date;
	lastStatus: string;
	taskdef: string;
	command: string | undefined;
};

function toCurrentTaskView(task: Task): CurrentTaskView {
	return {
		taskId: task.taskArn!.split("/").pop()!,
		startedAt: task.startedAt!,
		lastStatus: task.lastStatus!,
		taskdef: task.taskDefinitionArn!.split(":task-definition/")[1],
		command: task.overrides?.containerOverrides
			?.find((c) => c.name === "app")
			?.command?.join(" "),
	};
}

type FinishedTaskView = {
	taskId: string;

	// MEMO: タスク生成されたがコンテナ起動に失敗した場合にundefになる
	// TODO: しかしこれだと一覧を開始時間でソートできないので、createdAtとかちゃんとありそうなやつにしたほうがいいかも
	startedAt: Date | undefined;
	stoppedAt: Date;
	durationSec: number | undefined;
	taskdef: string;
	command: string | undefined;
};

function toFinishedTaskView(task: Task): FinishedTaskView {
	return {
		taskId: task.taskArn!.split("/").pop()!,
		startedAt: task.startedAt,
		stoppedAt: task.stoppedAt!,
		durationSec: task.startedAt
			? Math.round(
					(task.stoppedAt!.getTime() - task.startedAt.getTime()) / 1000,
				)
			: undefined,
		taskdef: task.taskDefinitionArn!.split(":task-definition/")[1],
		command: task.overrides?.containerOverrides
			?.find((c) => c.name === "app")
			?.command?.join(" "),
	};
}

type LoaderData = {
	currentTasks: CurrentTaskView[];
	finishedTasks: FinishedTaskView[];
	clusterName: string;
};

export default function Home() {
	const { currentTasks, finishedTasks, clusterName } =
		useLoaderData<LoaderData>();

	// 終了日時で日ごとにグループ化
	const groupTasksByStoppedDate = (
		tasks: FinishedTaskView[],
	): Record<string, FinishedTaskView[]> => {
		return tasks.reduce<Record<string, FinishedTaskView[]>>((acc, task) => {
			const dateKey = task.stoppedAt.toLocaleDateString("ja-JP", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			});
			if (!acc[dateKey]) {
				acc[dateKey] = [];
			}
			acc[dateKey].push(task);
			return acc;
		}, {});
	};

	const finishedTaskGroups = groupTasksByStoppedDate(finishedTasks);
	const finishedTaskGroupKeys = Object.keys(finishedTaskGroups);

	// 秒数を「1時間02分03秒」や「02分03秒」など短くわかりやすい表記に変換（分・秒は2桁ゼロ埋め）
	function formatDuration(durationSec: number | undefined): string {
		if (durationSec === undefined) return "";
		const hours = Math.floor(durationSec / 3600);
		const minutes = Math.floor((durationSec % 3600) / 60);
		const seconds = durationSec % 60;
		const pad = (n: number) => n.toString().padStart(2, "0");
		const parts: string[] = [];
		if (hours > 0) parts.push(`${hours}:`);
		if (minutes > 0 || hours > 0) parts.push(`${pad(minutes)}:`);
		parts.push(`${pad(seconds)}`);
		return parts.join("");
	}

	return (
		<div className="p-4">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-xl font-bold">{clusterName} のタスク一覧</h1>
				<div className="flex items-center space-x-4">
					<Link
						to="/config"
						className="text-sm text-blue-600 hover:text-blue-800 underline"
					>
						環境設定
					</Link>
				</div>
			</div>
			<h2 className="text-lg font-semibold my-4">実行中のタスク</h2>
			<div className="overflow-x-auto bg-white shadow rounded-lg">
				<table className="min-w-full divide-y divide-gray-200">
					<thead className="bg-gray-50">
						<tr>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								タスクID
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								開始時刻
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								ステータス
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								タスク定義
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								コンテナ実行コマンド
							</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{currentTasks.map((task) => (
							<tr key={task.taskId} className="hover:bg-gray-100">
								<td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
									<Link
										to={`/tasks/${task.taskId}`}
										className="hover:text-blue-800 underline font-mono"
									>
										{task.taskId.substring(0, 7)}
									</Link>
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{toViewDate(task.startedAt)}
								</td>
								<td
									className={`px-6 py-1 whitespace-nowrap text-sm ${
										{
											RUNNING: "bg-green-100 text-green-800",
											STOPPED: "bg-red-100 text-red-800",
											PENDING: "bg-yellow-100 text-yellow-800",
											DEPROVISIONING: "bg-gray-100 text-gray-800",
										}[task.lastStatus]
									}`}
								>
									{task.lastStatus}
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{task.taskdef}
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 space-y-1">
									{task.command ?? ""}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<h2 className="text-lg font-semibold my-4">終了したタスク</h2>
			<div className="overflow-x-auto bg-white shadow rounded-lg">
				<table className="min-w-full divide-y divide-gray-200">
					<thead className="bg-gray-50">
						<tr>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								タスクID
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								実行時間
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								タスク定義
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								コンテナ実行コマンド
							</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{finishedTaskGroupKeys.flatMap((dateKey) => [
							<tr key={dateKey}>
								<td
									colSpan={4}
									className="bg-gray-100 text-gray-700 px-6 py-1 align-middle"
									style={{
										fontWeight: "normal",
										fontSize: "0.875rem",
										lineHeight: "1.25rem",
									}}
								>
									{dateKey}
								</td>
							</tr>,
							...finishedTaskGroups[dateKey].map((task) => (
								<tr key={task.taskId} className="hover:bg-gray-100">
									<td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
										<Link
											to={`/tasks/${task.taskId}`}
											className="hover:text-blue-800 underline font-mono"
										>
											{task.taskId.substring(0, 7)}
										</Link>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{toViewDate(task.startedAt)} ~ {toViewDate(task.stoppedAt)}
										{task.durationSec !== undefined && (
											<span className="ml-2 text-xs text-gray-500">
												({formatDuration(task.durationSec)})
											</span>
										)}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{task.taskdef}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 space-y-1">
										{task.command ?? ""}
									</td>
								</tr>
							)),
						])}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function toViewDate(date: Date | undefined): string {
	if (!date) return "";

	return date.toLocaleString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
	});
}
