import type { Task } from "@aws-sdk/client-ecs";
import { type LoaderFunctionArgs, useLoaderData, Link } from "react-router";
import {
	describeTasks,
	filterLogEvents,
	listEcsTaskArns,
	parseEcsTaskStateChangeEvent,
} from "~/aws";

const CLUSTER_NAME = process.env.CLUSTER_NAME ?? "";
const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME ?? "";

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
	const allTaskArns = await listEcsTaskArns(CLUSTER_NAME);
	const currentTasks = await describeTasks(allTaskArns);

	const from = Date.now() - 24 * 60 * 60 * 1000; // 直近24時間分。ただちょっと多すぎてページ重いので、できればpaginateとかしたい
	const finishedTasks = (await filterLogEvents(LOG_GROUP_NAME, from))
		.map((log) => parseEcsTaskStateChangeEvent(log.message!).detail)
		.filter((task) => !task.startedBy?.startsWith("ecs-svc/"));

	return {
		currentTasks: currentTasks.map(toCurrentTaskView),
		finishedTasks: finishedTasks.map(toFinishedTaskView),
	};
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
};

export default function Home() {
	const { currentTasks, finishedTasks } = useLoaderData<LoaderData>();
	return (
		<div className="p-4">
			<h1 className="text-xl font-bold mb-4">{CLUSTER_NAME} のタスク一覧</h1>
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
										className="hover:text-blue-800 underline"
									>
										{task.taskId}
									</Link>
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{task.startedAt?.toLocaleString("ja-JP")}
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
								開始時刻
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								終了時刻
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								実行時間(秒)
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
						{finishedTasks.map((task) => (
							<tr key={task.taskId} className="hover:bg-gray-100">
								<td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
									<Link
										to={`/tasks/${task.taskId}`}
										className="hover:text-blue-800 underline"
									>
										{task.taskId}
									</Link>
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{task.startedAt?.toLocaleString("ja-JP")}
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{task.stoppedAt.toLocaleString("ja-JP")}
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{task.durationSec}
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
		</div>
	);
}
