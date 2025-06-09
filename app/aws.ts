import {
	CloudWatchLogsClient,
	paginateFilterLogEvents,
	paginateGetLogEvents,
	type FilteredLogEvent,
	type OutputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import {
	DescribeTaskDefinitionCommand,
	DescribeTasksCommand,
	ECSClient,
	paginateListTasks,
	type Task,
	type TaskDefinition,
} from "@aws-sdk/client-ecs";
import { getCurrentEnvironmentName } from "./config/environment";

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

/**
 * 特定のログストリームからログイベントを取得します。
 * 最新のログから指定された件数分を取得します。
 *
 * @param logGroupName - CloudWatch Logsのロググループ名
 * @param logStreamName - CloudWatch Logsのログストリーム名
 * @param limit - 取得するログイベントの最大件数（数百件程度を想定）
 * @returns Promise<OutputLogEvent[]> - ログイベントの配列
 */
export async function getLogEvents(
	logGroupName: string,
	logStreamName: string,
	limit: number,
): Promise<OutputLogEvent[]> {
	// FIXME: ログイベントが存在するのに空を返すことがある
	// たぶんこれだと思うが https://qiita.com/mmclsntr/items/09ebfa3a6c717923ead4

	const paginator = paginateGetLogEvents(
		{
			client: new CloudWatchLogsClient({}),
			stopOnSameToken: true, // GetLogEventsのpaginate版はこのオプションを明示しないと無限ループする https://github.com/aws/aws-sdk-js-v3/issues/3490
		},
		{ logGroupName, logStreamName, startFromHead: false, limit },
	);

	const events: OutputLogEvent[] = [];
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
	detail: Task;
};
export function parseEcsTaskStateChangeEvent(
	message: string,
): EcsTaskStateChangeEvent {
	const parsedEvent = JSON.parse(message) as EcsTaskStateChangeEvent;

	// detail内のDateな属性はparseしただけではstringのままなので、明示的にDateに変換する
	const detail = parsedEvent.detail;
	const dateKeys: (keyof Task)[] = [
		"createdAt",
		"executionStoppedAt",
		"pullStartedAt",
		"pullStoppedAt",
		"startedAt",
		"stoppingAt",
		"stoppedAt",
		"connectivityAt",
	];
	for (const key of dateKeys) {
		if (detail[key] && typeof detail[key] === "string") {
			// @ts-expect-error detail[key] is string but Task[keyof Task] is Date
			detail[key] = new Date(detail[key] as string);
		}
	}

	// MEMO: 他に変換が必要な属性があるかもしれないが、調べてない。困ったら変換を足す

	return parsedEvent;
}

// 過去タスクについてタスク詳細を取得したい場合、その情報源はECS State Changeのログしか存在しない。
// その情報はただのログであり、タスクやイベントのIDでO(1)で取得できるようなものではない。
// そのためなんらか別のかたちのデータストアを用意するしかなく、ここでは
// 「ユースケース上、先に一覧見てるでしょ」という前提のもと、一覧を見たときにデータをタスクIDで引っ張れるように
// キャッシュするようにしている。
const finishedTaskCache: Record<string, Record<string, Task>> = {};
export function storeFinishedTasks(tasks: Task[]) {
	const env = getCurrentEnvironmentName();
	if (!finishedTaskCache[env]) finishedTaskCache[env] = {};

	for (const task of tasks) {
		const id = task.taskArn!.split("/").pop()!;
		finishedTaskCache[env][id] = task;
	}
}
export function getFinishedTask(taskId: string): Task | undefined {
	const env = getCurrentEnvironmentName();
	return finishedTaskCache[env][taskId];
}

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
