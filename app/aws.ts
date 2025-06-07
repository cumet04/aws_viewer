import {
	CloudWatchLogsClient,
	paginateFilterLogEvents,
	type FilteredLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import {
	DescribeTaskDefinitionCommand,
	DescribeTasksCommand,
	ECSClient,
	paginateListTasks,
	type Task,
	type TaskDefinition,
} from "@aws-sdk/client-ecs";

/**
 * 指定したECSクラスター内の全てのタスクARN（RUNNING, PENDING, STOPPED）を取得します。
 * AWS SDKのpaginatorを利用して、全てのページからタスクARNを収集します。
 *
 * @param clusterName - 対象のECSクラスター名
 * @returns Promise<string[]> - 全てのタスクARNの配列
 */
export async function listEcsTaskArns(clusterName: string): Promise<string[]> {
	const STATUSES = ["RUNNING", "PENDING", "STOPPED"] as const;
	const allTaskArnsPromises = STATUSES.map(async (status) => {
		const paginator = paginateListTasks(
			{ client: ecsClient(), pageSize: 100 },
			{ cluster: clusterName, desiredStatus: status },
		);

		const arns: string[] = [];
		for await (const page of paginator) arns.push(...(page.taskArns ?? []));

		return arns;
	});

	return (await Promise.all(allTaskArnsPromises)).flat();
}

/**
 * 指定したECSタスクARN配列に対応するタスク情報を取得します。全てのARNが同一クラスタに属すると仮定します。
 *
 * @param arns - 取得対象のECSタスクARNの配列
 * @returns Promise<Task[]> - タスク情報の配列（存在しない場合は空配列）
 */
export async function describeTasks(arns: string[]): Promise<Task[]> {
	if (arns.length === 0) return [];

	const cluster = arns[0].split("/")[1]; // arnsはすべて同じクラスタに属すると見做し、1つ目からクラスタ名を取り出す
	const tasks = await ecsClient()
		.send(new DescribeTasksCommand({ cluster, tasks: arns }))
		.then((descRes) => descRes.tasks ?? []);

	return tasks as Task[];
}

export async function describeTaskDefinitions(
	arns: string[],
): Promise<TaskDefinition[]> {
	const raws = arns.map(
		async (arn: string) =>
			await ecsClient()
				.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
				.then((res) => res.taskDefinition),
	);

	const defs = (await Promise.all(raws)).filter((def) => def !== undefined);

	return defs as TaskDefinition[];
}

function ecsClient() {
	return new ECSClient({});
}

export async function filterLogEvents(
	logGroupName: string,
	startTime: number,
): Promise<FilteredLogEvent[]> {
	const paginator = paginateFilterLogEvents(
		{ client: new CloudWatchLogsClient({}) },
		{ logGroupName, startTime },
	);

	const events: FilteredLogEvent[] = [];
	for await (const page of paginator) events.push(...(page.events ?? []));

	return events;
}

export type EcsTaskStateChangeEvent = {
	version: string;
	id: string;
	"detail-type": string;
	source: string;
	account: string;
	time: string;
	region: string;
	detail: Task; // ここ多分Taskであってると思う。確証は無い
};

export function getLogStream(
	taskdef: TaskDefinition,
	taskId: string,
	containerName: string,
) {
	const appContainer = taskdef.containerDefinitions?.find(
		(container) => container.name === containerName,
	);
	if (!appContainer) return;

	const log = appContainer.logConfiguration!;
	if (log.logDriver !== "awslogs") return;

	const prefix = log.options?.["awslogs-stream-prefix"] || "";

	return {
		group: log.options?.["awslogs-group"]!,
		stream: `${prefix}/${containerName}/${taskId}`,
	};
}
