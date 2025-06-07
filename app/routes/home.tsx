import type { Container } from "@aws-sdk/client-ecs";
import { type LoaderFunctionArgs, useLoaderData, Link } from "react-router";
import { describeTasks, listEcsTaskArns } from "~/aws";

const CLUSTER_NAME = process.env.CLUSTER_NAME ?? "";

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
	const allTaskArns = await listEcsTaskArns(CLUSTER_NAME);
	const taskDetails = await describeTasks(allTaskArns);

	const data = taskDetails.map((task) => {
		const overrideMap = new Map<string, string[]>(
			(task.overrides!.containerOverrides ?? [])
				.filter((o) => o.command)
				.map((o) => [o.name!, o.command!]),
		);

		return {
			clusterArn: task.clusterArn!,
			taskArn: task.taskArn!,
			startedAt: task.startedAt!,
			lastStatus: task.lastStatus!,
			taskdef: task.taskDefinitionArn!.split(":task-definition/")[1],
			containers: (task.containers ?? []).map((c: Container) => ({
				name: c.name!,
				command: c.name ? overrideMap.get(c.name) : undefined,
			})),
		};
	});

	return { tasks: data };
}

type LoaderData = {
	tasks: {
		clusterArn: string;
		taskArn: string;
		startedAt: Date;
		lastStatus: string;
		taskdef: string;
		containers: Array<{ name: string; command?: string[] }>;
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
						<th className="border px-2 py-1">タスク定義</th>
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
								{task.taskArn ? (
									<Link
										to={`/tasks/${task.taskArn.split("/").pop()}`}
										className="text-blue-600 hover:text-blue-800 underline"
									>
										{task.taskArn.split("/").pop()}
									</Link>
								) : (
									"-"
								)}
							</td>
							<td className="border px-2 py-1">
								{task.startedAt
									? new Date(task.startedAt).toLocaleString()
									: "-"}
							</td>
							<td className="border px-2 py-1">{task.lastStatus}</td>
							<td className="border px-2 py-1">{task.taskdef ?? "-"}</td>
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
