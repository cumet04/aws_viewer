import type { TaskDefinition } from "@aws-sdk/client-ecs";
import type { Container } from "@aws-sdk/client-ecs";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import {
	describeTaskDefinitions,
	describeTasks,
	getLogStream,
	listEcsTaskArns,
} from "~/aws";

// クラスタ名は環境変数から取得
const CLUSTER_NAME = process.env.CLUSTER_NAME ?? "";

// Loader (SSR)
export async function loader(args: LoaderFunctionArgs) {
	const allTaskArns = await listEcsTaskArns(CLUSTER_NAME);
	const taskDetails = await describeTasks(allTaskArns);

	const taskDefArns = [
		...new Set(taskDetails.map((task) => task.taskDefinitionArn)),
	] as string[];

	const taskDefs = new Map<string, TaskDefinition>(
		(await describeTaskDefinitions(taskDefArns)).map((d) => [
			d.taskDefinitionArn!,
			d,
		]),
	);

	const data = taskDetails.map((task) => {
		// containerOverridesのマップを作成
		const overrideMap = new Map<string, string[]>(
			(task.overrides!.containerOverrides ?? [])
				.filter((o) => o.command)
				.map((o) => [o.name!, o.command!]),
		);

		// タスク定義情報を取得
		const taskDefinition = taskDefs.get(task.taskDefinitionArn!);
		const revision = task.taskDefinitionArn!.split(":").pop();

		const stream = getLogStream(
			taskDefinition!,
			task.taskArn!.split("/").pop()!,
			"app",
		);

		return {
			clusterArn: task.clusterArn,
			taskArn: task.taskArn,
			startedAt: task.startedAt,
			lastStatus: task.lastStatus,
			family: task.taskDefinitionArn
				?.split(":task-definition/")[1]
				?.split(":")[0],
			revision: revision,
			appLogGroup: stream?.group,
			appLogStreamName: stream?.stream,
			containers: (task.containers ?? []).map((c: Container) => ({
				name: c.name,
				command: c.name ? overrideMap.get(c.name) : undefined,
			})),
		};
	});

	return { tasks: data };
}

type LoaderData = {
	tasks: {
		clusterArn?: string;
		taskArn?: string;
		startedAt?: Date;
		lastStatus?: string;
		family?: string;
		revision?: string;
		appLogGroup?: string;
		appLogStreamName?: string;
		containers: Array<{ name?: string; command?: string[] }>;
	}[];
};

export default function Home() {
	const { tasks } = useLoaderData() as LoaderData;
	return (
		<div className="p-4">
			<h1 className="text-xl font-bold mb-4">ECSタスク一覧</h1>
			<table className="min-w-full border border-gray-300">
				<thead>
					<tr className="bg-gray-100">
						<th className="border px-2 py-1">クラスタ</th>
						<th className="border px-2 py-1">タスクID</th>
						<th className="border px-2 py-1">開始時刻</th>
						<th className="border px-2 py-1">ステータス</th>
						<th className="border px-2 py-1">タスク定義family</th>
						<th className="border px-2 py-1">revision</th>
						<th className="border px-2 py-1">appコンテナのロググループ名</th>
						<th className="border px-2 py-1">
							appコンテナのログストリームのname
						</th>
						<th className="border px-2 py-1">コンテナ実行コマンド</th>
					</tr>
				</thead>
				<tbody>
					{tasks.map((task) => (
						<tr key={task.taskArn}>
							<td className="border px-2 py-1">
								{task.clusterArn?.split("/").pop()}
							</td>
							<td className="border px-2 py-1">
								{task.taskArn?.split("/").pop()}
							</td>
							<td className="border px-2 py-1">
								{task.startedAt
									? new Date(task.startedAt).toLocaleString()
									: "-"}
							</td>
							<td className="border px-2 py-1">{task.lastStatus}</td>
							<td className="border px-2 py-1">{task.family ?? "-"}</td>
							<td className="border px-2 py-1">{task.revision ?? "-"}</td>
							<td className="border px-2 py-1">
								{task.appLogGroup ? (
									<span className="font-mono text-xs">{task.appLogGroup}</span>
								) : (
									"-"
								)}
							</td>
							<td className="border px-2 py-1">
								{task.appLogStreamName ? (
									<span className="font-mono text-xs">
										{task.appLogStreamName}
									</span>
								) : (
									"-"
								)}
							</td>
							<td className="border px-2 py-1">
								{task.containers.length > 0
									? task.containers.map((c) =>
											c.command && c.command.length > 0 ? (
												<div key={c.name}>
													<span className="font-mono text-xs">{c.name}</span>:{" "}
													{c.command.join(" ")}
												</div>
											) : null,
										)
									: "-"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
