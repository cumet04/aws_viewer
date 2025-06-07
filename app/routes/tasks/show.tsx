// # ページ仕様
// ECSタスクの詳細ページを表示するためのページです。
// URLパラメータでタスクIDが指定されているので、そのIDからタスクの詳細情報を取得し、表示します。
// あわせて、タスクが紐づいているタスク定義の詳細情報も表示します。

import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { describeTasks, describeTaskDefinitions, listEcsTaskArns } from "~/aws";

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
}

interface DisplayTaskDefinitionData {
	taskDefinitionArn: string;
	family: string;
	revision: number;
	status: string;
	cpu?: string;
	memory?: string;
	networkMode?: string;
	requiresCompatibilities?: string[];
	containerDefinitions: Array<{
		name: string;
		image: string;
		cpu?: number;
		memory?: number;
		memoryReservation?: number;
		essential?: boolean;
		portMappings?: Array<{
			containerPort?: number;
			hostPort?: number;
			protocol?: string;
		}>;
		environment?: Array<{
			name?: string;
			value?: string;
		}>;
		logConfiguration?: {
			logDriver?: string;
			options?: Record<string, string>;
		};
	}>;
}

// クラスタ名は環境変数から取得
const CLUSTER_NAME = process.env.CLUSTER_NAME ?? "";

export async function loader({ params }: LoaderFunctionArgs) {
	const taskId = params.id!;

	// 現在のクラスタ内のすべてのタスクから該当するタスクを検索
	// タスクIDだけではARNが構築できないため、既存のlistEcsTaskArns関数を利用
	const allTaskArns = await listEcsTaskArns(CLUSTER_NAME);
	const targetTaskArn = allTaskArns.find((arn) => arn.endsWith(`/${taskId}`));

	if (!targetTaskArn) {
		throw new Response("タスクが見つかりません", { status: 404 });
	}

	// タスク詳細を取得
	const tasks = await describeTasks([targetTaskArn]);
	if (tasks.length === 0) {
		throw new Response("タスクが見つかりません", { status: 404 });
	}

	const task = tasks[0];

	// タスク定義詳細を取得
	const taskDefinitions = await describeTaskDefinitions([
		task.taskDefinitionArn!,
	]);
	const taskDefinition = taskDefinitions[0];

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
	};

	const displayTaskDefinition: DisplayTaskDefinitionData = {
		taskDefinitionArn: taskDefinition.taskDefinitionArn!,
		family: taskDefinition.family!,
		revision: taskDefinition.revision!,
		status: taskDefinition.status!,
		cpu: taskDefinition.cpu,
		memory: taskDefinition.memory,
		networkMode: taskDefinition.networkMode,
		requiresCompatibilities: taskDefinition.requiresCompatibilities,
		containerDefinitions: (taskDefinition.containerDefinitions ?? []).map(
			(containerDef) => ({
				name: containerDef.name!,
				image: containerDef.image!,
				cpu: containerDef.cpu,
				memory: containerDef.memory,
				memoryReservation: containerDef.memoryReservation,
				essential: containerDef.essential,
				portMappings: containerDef.portMappings?.map((pm) => ({
					containerPort: pm.containerPort,
					hostPort: pm.hostPort,
					protocol: pm.protocol,
				})),
				environment: containerDef.environment?.map((env) => ({
					name: env.name,
					value: env.value,
				})),
				logConfiguration: containerDef.logConfiguration
					? {
							logDriver: containerDef.logConfiguration.logDriver,
							options: containerDef.logConfiguration.options,
						}
					: undefined,
			}),
		),
	};

	return { task: displayTask, taskDefinition: displayTaskDefinition };
}

type LoaderData = {
	task: DisplayTaskData;
	taskDefinition: DisplayTaskDefinitionData;
};

export default function TaskShow() {
	const { task, taskDefinition } = useLoaderData() as LoaderData;

	return (
		<div className="p-4 max-w-6xl mx-auto">
			<h1 className="text-2xl font-bold mb-6">ECSタスク詳細</h1>

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

			{/* タスク定義情報 */}
			<div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
				<h2 className="text-lg font-semibold mb-4">タスク定義情報</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					<div>
						<div className="block text-sm font-medium text-gray-700">
							ファミリー
						</div>
						<div className="mt-1 text-sm">{taskDefinition.family}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							リビジョン
						</div>
						<div className="mt-1 text-sm">{taskDefinition.revision}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							ステータス
						</div>
						<div className="mt-1 text-sm">{taskDefinition.status}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							ネットワークモード
						</div>
						<div className="mt-1 text-sm">
							{taskDefinition.networkMode || "-"}
						</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">CPU</div>
						<div className="mt-1 text-sm">{taskDefinition.cpu || "-"}</div>
					</div>
					<div>
						<div className="block text-sm font-medium text-gray-700">
							メモリ
						</div>
						<div className="mt-1 text-sm">{taskDefinition.memory || "-"}</div>
					</div>
					<div className="col-span-2">
						<div className="block text-sm font-medium text-gray-700">
							必要な互換性
						</div>
						<div className="mt-1 text-sm">
							{taskDefinition.requiresCompatibilities?.join(", ") || "-"}
						</div>
					</div>
				</div>

				{/* コンテナ定義 */}
				<h3 className="text-md font-semibold mb-3">コンテナ定義</h3>
				<div className="space-y-4">
					{taskDefinition.containerDefinitions.map((containerDef) => (
						<div
							key={containerDef.name}
							className="border border-gray-200 rounded p-4"
						>
							<h4 className="font-medium mb-2">{containerDef.name}</h4>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
								<div>
									<span className="font-medium">イメージ:</span>
									<div className="font-mono text-xs bg-gray-50 p-1 rounded mt-1">
										{containerDef.image}
									</div>
								</div>
								<div>
									<span className="font-medium">Essential:</span>{" "}
									{containerDef.essential ? "Yes" : "No"}
								</div>
								<div>
									<span className="font-medium">CPU:</span>{" "}
									{containerDef.cpu || "-"}
								</div>
								<div>
									<span className="font-medium">メモリ:</span>{" "}
									{containerDef.memory || "-"}
								</div>
								{containerDef.memoryReservation && (
									<div>
										<span className="font-medium">メモリ予約:</span>{" "}
										{containerDef.memoryReservation}
									</div>
								)}

								{/* ポートマッピング */}
								{containerDef.portMappings &&
									containerDef.portMappings.length > 0 && (
										<div className="col-span-2">
											<span className="font-medium">ポートマッピング:</span>
											<div className="mt-1 space-y-1">
												{containerDef.portMappings.map((pm) => (
													<div
														key={`${pm.containerPort}-${pm.hostPort}`}
														className="text-xs bg-gray-50 p-1 rounded"
													>
														Container: {pm.containerPort} → Host: {pm.hostPort}{" "}
														({pm.protocol})
													</div>
												))}
											</div>
										</div>
									)}

								{/* 環境変数 */}
								{containerDef.environment &&
									containerDef.environment.length > 0 && (
										<div className="col-span-2">
											<span className="font-medium">環境変数:</span>
											<div className="mt-1 max-h-32 overflow-y-auto">
												{containerDef.environment.map((env) => (
													<div
														key={env.name}
														className="text-xs bg-gray-50 p-1 rounded mb-1"
													>
														<span className="font-mono">{env.name}</span> ={" "}
														<span className="font-mono">{env.value}</span>
													</div>
												))}
											</div>
										</div>
									)}

								{/* ログ設定 */}
								{containerDef.logConfiguration && (
									<div className="col-span-2">
										<span className="font-medium">ログ設定:</span>
										<div className="mt-1 text-xs bg-gray-50 p-2 rounded">
											<div>
												<span className="font-medium">ドライバー:</span>{" "}
												{containerDef.logConfiguration.logDriver}
											</div>
											{containerDef.logConfiguration.options && (
												<div className="mt-1">
													<span className="font-medium">オプション:</span>
													<div className="ml-2">
														{Object.entries(
															containerDef.logConfiguration.options,
														).map(([key, value]) => (
															<div key={key}>
																{key}: {value}
															</div>
														))}
													</div>
												</div>
											)}
										</div>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
