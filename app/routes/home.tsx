// ## ページ仕様:
// AWS APIを使い、取得できるECSタスクの詳細情報一覧を表示する。
// 
// ### データ取得方法
// - listTasksとdescribeTasksを使用して、取得できるタスクすべての詳細情報を取得する
// - クラスタ名は環境変数CLUSTER_NAMEから取得する
// - タスクのステータスは、RUNNING, PENDING, STOPPEDのすべてを対象とする
// - タスク詳細情報に紐づいたタスク定義のrevisionも取得する
//
// ### 表示内容
// 下記をtable表示する。スタイルは一旦はごくシンプルなものとする。
// - ECSクラスタ
// - タスクID
// - タスク開始時刻
// - タスクステータス
// - 各コンテナの実行コマンド(containerOverridesが存在する場合のみ。コマンドはoverridesから取得)
// - タスク定義のfamily名
// - appコンテナのロググループ名
// - appコンテナのログストリームのname

import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ECSClient, ListTasksCommand, DescribeTasksCommand, DescribeTaskDefinitionCommand, type ListTasksCommandOutput } from "@aws-sdk/client-ecs";
import { type Container } from "@aws-sdk/client-ecs";

// クラスタ名は環境変数から取得
const CLUSTER_NAME = process.env.CLUSTER_NAME ?? "";
const STATUSES = ["RUNNING", "PENDING", "STOPPED"] as const;

// Loader (SSR)
export async function loader(args: LoaderFunctionArgs) {
  const client = new ECSClient({});
  let allTaskArns: string[] = [];
  // 各ステータスごとにlistTasks
  for (const status of STATUSES) {
    let nextToken: string | undefined = undefined;
    do {
      const listRes: ListTasksCommandOutput = await client.send(
        new ListTasksCommand({
          cluster: CLUSTER_NAME,
          desiredStatus: status,
          nextToken,
        })
      );
      if (listRes.taskArns) allTaskArns.push(...listRes.taskArns);
      nextToken = listRes.nextToken;
    } while (nextToken);
  }
  // describeTasksは100件ずつ
  const taskDetails: any[] = [];
  for (let i = 0; i < allTaskArns.length; i += 100) {
    const arns = allTaskArns.slice(i, i + 100);
    if (arns.length === 0) continue;
    const descRes = await client.send(
      new DescribeTasksCommand({
        cluster: CLUSTER_NAME,
        tasks: arns,
      })
    );
    if (descRes.tasks) taskDetails.push(...descRes.tasks);
  }
  // containerOverridesが存在する場合のみ、コマンドはoverridesから取得
  // タスク定義情報も取得する
  const taskDefinitionArns = [...new Set(taskDetails.map(task => task.taskDefinitionArn).filter(Boolean))];
  const taskDefinitions = new Map();
  
  // タスク定義を取得（100件ずつの制限はないので一度に取得）
  for (const arn of taskDefinitionArns) {
    const taskDefRes = await client.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: arn,
      })
    );
    if (taskDefRes.taskDefinition) {
      taskDefinitions.set(arn, taskDefRes.taskDefinition);
    }
  }
  
  const data = taskDetails.map((task) => {
    // containerOverridesはtask.overrides?.containerOverrides
    const overrideMap = new Map<string, string[] | undefined>();
    if (task.overrides && Array.isArray(task.overrides.containerOverrides)) {
      for (const o of task.overrides.containerOverrides) {
        if (o.name) overrideMap.set(o.name, o.command);
      }
    }
    
    // タスク定義情報を取得
    const taskDefinition = taskDefinitions.get(task.taskDefinitionArn);
    const revision = task.taskDefinitionArn?.split(":").pop();
    
    // appコンテナのロググループ名とログストリーム名を取得
    const appContainer = taskDefinition?.containerDefinitions?.find((container: any) => container.name === 'app');
    let appLogGroup = '';
    let appLogStreamName = '';
    if (appContainer?.logConfiguration?.logDriver === 'awslogs') {
      const logGroup = appContainer.logConfiguration.options?.['awslogs-group'];
      const taskId = task.taskArn?.split('/').pop();
      if (logGroup && taskId) {
        appLogGroup = logGroup;
        appLogStreamName = `${appContainer.logConfiguration.options?.['awslogs-stream-prefix']}/app/${taskId}`;
      }
    }
    
    return {
      clusterArn: task.clusterArn,
      taskArn: task.taskArn,
      startedAt: task.startedAt,
      lastStatus: task.lastStatus,
      family: task.taskDefinitionArn?.split(":task-definition/")[1]?.split(":")[0],
      revision: revision,
      appLogGroup: appLogGroup,
      appLogStreamName: appLogStreamName,
      containers: (task.containers || []).map((c: Container) => ({
        name: c.name,
        command: c.name ? overrideMap.get(c.name) : undefined,
      })),
    };
  });
  return { tasks: data };
}

type LoaderData = {
  tasks: Array<{
    clusterArn?: string;
    taskArn?: string;
    startedAt?: string;
    lastStatus?: string;
    family?: string;
    revision?: string;
    appLogGroup?: string;
    appLogStreamName?: string;
    containers: Array<{ name?: string; command?: string[] }>;
  }>;
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
            <th className="border px-2 py-1">appコンテナのログストリームのname</th>
            <th className="border px-2 py-1">コンテナ実行コマンド</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.taskArn}>
              <td className="border px-2 py-1">{task.clusterArn?.split("/").pop()}</td>
              <td className="border px-2 py-1">{task.taskArn?.split("/").pop()}</td>
              <td className="border px-2 py-1">{task.startedAt ? new Date(task.startedAt).toLocaleString() : "-"}</td>
              <td className="border px-2 py-1">{task.lastStatus}</td>
              <td className="border px-2 py-1">{task.family ?? '-'}</td>
              <td className="border px-2 py-1">{task.revision ?? '-'}</td>
              <td className="border px-2 py-1">
                {task.appLogGroup ? (
                  <span className="font-mono text-xs">{task.appLogGroup}</span>
                ) : '-'}
              </td>
              <td className="border px-2 py-1">
                {task.appLogStreamName ? (
                  <span className="font-mono text-xs">{task.appLogStreamName}</span>
                ) : '-'}
              </td>
              <td className="border px-2 py-1">
                {task.containers.length > 0
                  ? task.containers.map((c, i) =>
                      c.command && c.command.length > 0 ? (
                        <div key={i}>
                          <span className="font-mono text-xs">{c.name}</span>: {c.command.join(" ")}
                        </div>
                      ) : null
                    )
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
