import {
	type LoaderFunctionArgs,
	useLoaderData,
	Link,
	Await,
	useSearchParams, // 追加
} from "react-router";
import { Suspense } from "react";
import {
	describeTasks,
	describeTaskDefinitions,
	listEcsTaskArns,
	getLogEvents,
	getLogStream,
	getFinishedTask,
} from "~/aws";
import { getCurrentEnvironmentConfig } from "~/config/environment";
import type { ContainerOverride } from "@aws-sdk/client-ecs";
import type { OutputLogEvent } from "@aws-sdk/client-cloudwatch-logs";

// 表示用データの型定義
interface DisplayTaskData {
	taskArn: string;
	taskId: string;
	clusterArn: string;
	clusterName: string;
	taskDefinitionArn: string;
	family: string;
	revision: string;
	lastStatus: string;
	desiredStatus: string;
	createdAt?: Date;
	startedAt?: Date;
	stoppedAt?: Date;
	cpu?: string;
	memory?: string;
	containers: Array<{
		name: string;
		lastStatus?: string;
		image?: string;
		cpu?: string;
		memory?: string;
	}>;
	overrides?: Array<{
		name: string;
		command?: string[];
	}>;
}

interface ContainerLogData {
	containerName: string;
	logGroupName?: string;
	logStreamName?: string;
	logs: OutputLogEvent[];
}

// クラスタ名は環境設定から取得
export async function loader({ params, request }: LoaderFunctionArgs) {
	const taskId = params.id!;
	const envConfig = getCurrentEnvironmentConfig();

	// クエリパラメータからコンテナ名を取得
	const url = new URL(request.url);
	const queryContainerName = url.searchParams.get("container");

	const task = await (async () => {
		// 一覧で取得済の過去タスクの場合はここで取れるので、取れたら終了
		const task = getFinishedTask(taskId);
		if (task) return task;

		// 現在のクラスタ内のすべてのタスクから該当するタスクを検索
		// タスクIDだけではARNが構築できないため、既存のlistEcsTaskArns関数を利用
		const allTaskArns = await listEcsTaskArns(envConfig.cluster_name);
		const targetTaskArn = allTaskArns.find((arn) => arn.endsWith(`/${taskId}`));

		if (!targetTaskArn) {
			throw new Response("タスクが見つかりません", { status: 404 });
		}

		// タスク詳細を取得
		const tasks = await describeTasks([targetTaskArn]);
		if (tasks.length === 0) {
			throw new Response("タスクが見つかりません", { status: 404 });
		}

		return tasks[0];
	})();

	// ログ取得のためだけにタスク定義詳細を取得
	const taskDefinitions = await describeTaskDefinitions([
		task.taskDefinitionArn!,
	]);
	const taskDefinition = taskDefinitions[0];

	// containerOverrideの情報を取得
	const overrides =
		task.overrides?.containerOverrides?.map((override: ContainerOverride) => ({
			name: override.name!,
			command: override.command,
		})) || [];

	// 表示用データに変換
	const displayTask: DisplayTaskData = {
		taskArn: task.taskArn!,
		taskId: task.taskArn!.split("/").pop()!,
		clusterArn: task.clusterArn!,
		clusterName: task.clusterArn!.split("/").pop()!,
		taskDefinitionArn: task.taskDefinitionArn!,
		family: task
			.taskDefinitionArn!.split(":task-definition/")[1]
			?.split(":")[0]!,
		revision: task.taskDefinitionArn!.split(":").pop()!,
		lastStatus: task.lastStatus!,
		desiredStatus: task.desiredStatus!,
		createdAt: task.createdAt ? new Date(task.createdAt) : undefined,
		startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
		stoppedAt: task.stoppedAt ? new Date(task.stoppedAt) : undefined,
		cpu: task.cpu,
		memory: task.memory,
		containers: (task.containers ?? []).map((container) => ({
			name: container.name!,
			lastStatus: container.lastStatus,
			image: container.image,
			cpu: container.cpu?.toString(),
			memory: container.memory?.toString(),
		})),
		overrides: overrides.length > 0 ? overrides : undefined,
	};

	const logLimit = 100; // 取得するログ件数

	// 表示対象のコンテナを決定
	let targetContainerName = queryContainerName;
	if (!targetContainerName) {
		targetContainerName = envConfig.main_container; // デフォルトは設定値
	}
	const targetContainer = displayTask.containers.find(
		(c) => c.name === targetContainerName,
	);

	// 対象コンテナが存在しない場合は最初のコンテナをフォールバック
	const containerForLog = targetContainer
		? targetContainer
		: displayTask.containers[0];

	const containerLogPromise: Promise<ContainerLogData | null> = containerForLog
		? (async () => {
				const logStream = getLogStream(
					taskDefinition,
					displayTask.taskId,
					containerForLog.name,
				);
				if (!logStream) {
					return {
						containerName: containerForLog.name,
						logGroupName: undefined,
						logStreamName: undefined,
						logs: [],
					};
				}

				const logs = await getLogEvents(
					logStream.group,
					logStream.stream,
					logLimit,
				);
				return {
					containerName: containerForLog.name,
					logGroupName: logStream.group,
					logStreamName: logStream.stream,
					logs: logs,
				};
			})()
		: Promise.resolve(null); // コンテナがない場合はnullを返す

	return {
		task: displayTask,
		containerLog: containerLogPromise, // 単一のコンテナログに変更
		mainContainer: envConfig.main_container, // 設定値を追加
	};
}

type LoaderData = {
	task: DisplayTaskData;
	containerLog: Promise<ContainerLogData | null>; // 単一のコンテナログに変更 (null許容)
	mainContainer: string; // 設定値を追加
};

export default function TaskShow() {
	const { task, containerLog, mainContainer } = useLoaderData() as LoaderData;
	const [searchParams, setSearchParams] = useSearchParams(); // 追加

	const selectedContainerName =
		searchParams.get("container") ||
		(task.containers.find((c) => c.name === mainContainer)
			? mainContainer
			: task.containers[0]?.name);

	return (
		<div className="p-4 max-w-6xl mx-auto">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center space-x-4">
					<Link to="/" className="text-blue-600 hover:text-blue-800 underline">
						← タスク一覧に戻る
					</Link>
					<h1 className="text-2xl font-bold">ECSタスク詳細</h1>
				</div>
				<div className="flex items-center space-x-4">
					<Link
						to="/config"
						className="text-sm text-blue-600 hover:text-blue-800 underline"
					>
						環境設定
					</Link>
				</div>
			</div>

			{/* タスク基本情報 */}
			<div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
				<h2 className="text-lg font-semibold mb-4">タスク基本情報</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<div className="block text-sm font-medium text-gray-700">
							タスクID
						</div>
						<div className="mt-1 text-sm font-mono bg-gray-50 p-2 rounded">
							{task.taskId}
						</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							クラスタ名
						</div>
						<div className="mt-1 text-sm">{task.clusterName}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							現在のステータス
						</div>
						<div className="mt-1 text-sm">
							<span
								className={`px-2 py-1 rounded text-xs font-medium ${
									task.lastStatus === "RUNNING"
										? "bg-green-100 text-green-800"
										: task.lastStatus === "STOPPED"
											? "bg-red-100 text-red-800"
											: "bg-yellow-100 text-yellow-800"
								}`}
							>
								{task.lastStatus}
							</span>
						</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							期待ステータス
						</div>
						<div className="mt-1 text-sm">{task.desiredStatus}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">CPU</div>
						<div className="mt-1 text-sm">{task.cpu || "-"}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							メモリ
						</div>
						<div className="mt-1 text-sm">{task.memory || "-"}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							作成日時
						</div>
						<div className="mt-1 text-sm">
							{task.createdAt ? task.createdAt.toLocaleString() : "-"}
						</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							開始日時
						</div>
						<div className="mt-1 text-sm">
							{task.startedAt ? task.startedAt.toLocaleString() : "-"}
						</div>
					</div>
					{task.stoppedAt && (
						<div>
							<div className="block text-sm font-medium text-gray-700">
								停止日時
							</div>
							<div className="mt-1 text-sm">
								{task.stoppedAt.toLocaleString()}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* コンテナオーバーライド情報（存在する場合のみ表示） */}
			{task.overrides && task.overrides.length > 0 && (
				<div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
					<h2 className="text-lg font-semibold mb-4">コンテナオーバーライド</h2>
					<div className="space-y-4">
						{task.overrides.map((override) => (
							<div
								key={override.name}
								className="border border-gray-200 rounded p-4"
							>
								<h3 className="font-medium mb-2">{override.name}</h3>
								{override.command && override.command.length > 0 && (
									<div>
										<div className="text-sm font-medium text-gray-700 mb-2">
											実行コマンド:
										</div>
										<div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto">
											{override.command.join(" ")}
										</div>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{/* コンテナ情報 */}
			<div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
				<h2 className="text-lg font-semibold mb-4">実行中のコンテナ</h2>
				<div className="overflow-x-auto">
					<table className="min-w-full border border-gray-300">
						<thead>
							<tr className="bg-gray-50">
								<th className="border border-gray-300 px-4 py-2 text-left">
									コンテナ名
								</th>
								<th className="border border-gray-300 px-4 py-2 text-left">
									ステータス
								</th>
								<th className="border border-gray-300 px-4 py-2 text-left">
									イメージ
								</th>
								<th className="border border-gray-300 px-4 py-2 text-left">
									CPU
								</th>
								<th className="border border-gray-300 px-4 py-2 text-left">
									メモリ
								</th>
							</tr>
						</thead>
						<tbody>
							{task.containers.map((container) => (
								<tr key={container.name}>
									<td className="border border-gray-300 px-4 py-2 font-medium">
										{container.name}
									</td>
									<td className="border border-gray-300 px-4 py-2">
										{container.lastStatus || "-"}
									</td>
									<td className="border border-gray-300 px-4 py-2 font-mono text-xs">
										{container.image || "-"}
									</td>
									<td className="border border-gray-300 px-4 py-2">
										{container.cpu || "-"}
									</td>
									<td className="border border-gray-300 px-4 py-2">
										{container.memory || "-"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{/* コンテナログ */}
			<div className="bg-white border border-gray-300 rounded-lg p-4">
				<h2 className="text-lg font-semibold mb-4">コンテナログ(最大100件)</h2>

				{/* コンテナ選択タブ */}
				<div className="mb-4 border-b border-gray-200">
					<nav className="-mb-px flex space-x-8" aria-label="Tabs">
						{task.containers.map((container) => (
							<button
								key={container.name}
								type="button"
								onClick={() => setSearchParams({ container: container.name })}
								className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm
									${
										selectedContainerName === container.name
											? "border-blue-500 text-blue-600"
											: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
									}
								`}
							>
								{container.name}
							</button>
						))}
					</nav>
				</div>

				<Suspense
					fallback={
						<div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded p-3 mb-4">
							ログデータを読み込んでいます...
						</div>
					}
				>
					<Await resolve={containerLog}>
						{(resolvedContainerLog) => {
							if (!resolvedContainerLog) {
								return (
									<div className="text-gray-500 text-sm p-3 bg-gray-50 rounded">
										ログ表示対象のコンテナが見つかりません。
									</div>
								);
							}
							return (
								<div
									key={resolvedContainerLog.containerName}
									className="border border-gray-200 rounded-lg p-4"
								>
									<h3 className="text-md font-semibold mb-3 flex items-center">
										<span className="mr-2">
											{resolvedContainerLog.containerName}
										</span>
										{resolvedContainerLog.logGroupName && (
											<span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
												{resolvedContainerLog.logGroupName}
											</span>
										)}
									</h3>

									{resolvedContainerLog.logs.length > 0 ? (
										<div className="bg-black text-green-400 p-3 rounded-md overflow-auto max-h-96 font-mono text-sm">
											{resolvedContainerLog.logs.map((log, index) => (
												// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
												<div key={index} className="mb-1">
													<span className="text-gray-400">
														{log.timestamp
															? new Date(log.timestamp).toLocaleString()
															: ""}
													</span>{" "}
													<span>{log.message}</span>
												</div>
											))}
										</div>
									) : (
										<div className="text-gray-500 text-sm p-3 bg-gray-50 rounded">
											{resolvedContainerLog.logGroupName
												? "ログデータが見つかりません"
												: "ログ設定が見つかりません（awslogs以外のログドライバーまたは設定なし）"}
										</div>
									)}

									{resolvedContainerLog.logStreamName && (
										<div className="mt-2 text-xs text-gray-500">
											ログストリーム:{" "}
											<span className="font-mono">
												{resolvedContainerLog.logStreamName}
											</span>
										</div>
									)}
								</div>
							);
						}}
					</Await>
				</Suspense>
			</div>
		</div>
	);
}
