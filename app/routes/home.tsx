import type { Task } from "@aws-sdk/client-ecs";
import { type LoaderFunctionArgs, useLoaderData, Link } from "react-router";
import { describeTasks, listEcsTaskArns } from "~/aws";

const CLUSTER_NAME = process.env.CLUSTER_NAME ?? "";

export async function loader(args: LoaderFunctionArgs): Promise<LoaderData> {
	const allTaskArns = await listEcsTaskArns(CLUSTER_NAME);
	const taskDetails = await describeTasks(allTaskArns);

	return { currentTasks: taskDetails.map(toCurrentTaskView) };
}

type CurrentTaskView = {
	taskArn: string;
	startedAt: Date;
	lastStatus: string;
	taskdef: string;
	command: string | undefined;
};

function toCurrentTaskView(task: Task): CurrentTaskView {
	return {
		taskArn: task.taskArn!,
		startedAt: task.startedAt!,
		lastStatus: task.lastStatus!,
		taskdef: task.taskDefinitionArn!.split(":task-definition/")[1],
		command: task.overrides?.containerOverrides
			?.find((c) => c.name === "app")
			?.command?.join(" "),
	};
}

type LoaderData = {
	currentTasks: CurrentTaskView[];
};

export default function Home() {
	const { currentTasks } = useLoaderData<LoaderData>();
	return (
		<div className="p-4">
			<h1 className="text-xl font-bold mb-4">{CLUSTER_NAME} のタスク一覧</h1>
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
							<tr key={task.taskArn} className="hover:bg-gray-100">
								<td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
									<Link
										to={`/tasks/${task.taskArn.split("/").pop()!}`}
										className="hover:text-blue-800 underline"
									>
										{task.taskArn.split("/").pop()}
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
		</div>
	);
}
