import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	useLoaderData,
	Form,
	redirect,
} from "react-router";
import {
	getCurrentEnvironmentConfig,
	getCurrentEnvironmentName,
	getAvailableEnvironments,
	getEnvironmentConfig,
	setCurrentEnvironment,
} from "~/config/environment";

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const newEnvironment = formData.get("environment") as string;

	if (!newEnvironment) {
		throw new Error("環境名が指定されていません");
	}

	try {
		setCurrentEnvironment(newEnvironment);
		return redirect("/config");
	} catch (error) {
		throw new Error(
			`環境の切り替えに失敗しました: ${(error as Error).message}`,
		);
	}
}

export async function loader({ request }: LoaderFunctionArgs) {
	const currentEnv = getCurrentEnvironmentName();
	const currentConfig = getCurrentEnvironmentConfig();
	const availableEnvs = getAvailableEnvironments();

	// 全環境の設定を取得
	const allConfigs = Object.fromEntries(
		availableEnvs.map((envName) => [envName, getEnvironmentConfig(envName)]),
	);

	return {
		currentEnvironment: currentEnv,
		currentConfig,
		availableEnvironments: availableEnvs,
		allConfigurations: allConfigs,
	};
}

type LoaderData = {
	currentEnvironment: string;
	currentConfig: {
		cluster_name: string;
		log_group_name: string;
	};
	availableEnvironments: string[];
	allConfigurations: Record<
		string,
		{
			cluster_name: string;
			log_group_name: string;
		}
	>;
};

export default function ConfigDebug() {
	const {
		currentEnvironment,
		currentConfig,
		availableEnvironments,
		allConfigurations,
	} = useLoaderData<LoaderData>();

	return (
		<div className="p-4 max-w-4xl mx-auto">
			<h1 className="text-2xl font-bold mb-6">環境設定</h1>

			{/* 環境切り替えセクション */}
			<div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
				<h2 className="text-lg font-semibold mb-4">環境切り替え</h2>
				<p className="text-sm text-gray-600 mb-4">
					下記から使用する環境を選択してください。現在の環境は{" "}
					<span className="font-semibold text-blue-600">
						{currentEnvironment}
					</span>{" "}
					です。
				</p>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
					{availableEnvironments.map((envName) => {
						const config = allConfigurations[envName];
						const isCurrent = envName === currentEnvironment;

						return (
							<div
								key={envName}
								className={`border rounded-lg p-4 transition-all ${
									isCurrent
										? "border-blue-500 bg-blue-50 shadow-md"
										: "border-gray-200 hover:border-gray-300"
								}`}
							>
								<div className="flex items-center justify-between mb-2">
									<h3
										className={`font-medium ${isCurrent ? "text-blue-700" : "text-gray-800"}`}
									>
										{envName}
									</h3>
									{isCurrent && (
										<span className="px-2 py-1 bg-blue-500 text-white text-xs rounded font-medium">
											使用中
										</span>
									)}
								</div>
								<div className="text-sm text-gray-600 mb-3">
									<div>
										クラスタ:{" "}
										<span className="font-mono text-gray-800">
											{config.cluster_name}
										</span>
									</div>
									<div>
										ログ:{" "}
										<span className="font-mono text-gray-800">
											{config.log_group_name}
										</span>
									</div>
								</div>
								{!isCurrent && (
									<Form method="post">
										<input type="hidden" name="environment" value={envName} />
										<button
											type="submit"
											className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors font-medium"
										>
											{envName} 環境に切り替え
										</button>
									</Form>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* 現在の環境詳細情報 */}
			<div className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
				<h2 className="text-lg font-semibold mb-4">現在の環境詳細</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<div className="text-sm font-medium text-gray-700">環境名</div>
						<div className="mt-1 text-sm font-mono bg-gray-50 p-2 rounded">
							{currentEnvironment}
						</div>
					</div>
					<div>
						<div className="text-sm font-medium text-gray-700">クラスタ名</div>
						<div className="mt-1 text-sm font-mono bg-gray-50 p-2 rounded">
							{currentConfig.cluster_name}
						</div>
					</div>
					<div className="md:col-span-2">
						<div className="text-sm font-medium text-gray-700">
							ロググループ名
						</div>
						<div className="mt-1 text-sm font-mono bg-gray-50 p-2 rounded">
							{currentConfig.log_group_name}
						</div>
					</div>
				</div>
			</div>

			{/* 利用可能な環境一覧 */}
			<div className="bg-white border border-gray-300 rounded-lg p-4">
				<h2 className="text-lg font-semibold mb-4">利用可能な環境</h2>
				<div className="space-y-4">
					{availableEnvironments.map((envName) => {
						const config = allConfigurations[envName];
						const isCurrent = envName === currentEnvironment;

						return (
							<div
								key={envName}
								className={`border rounded-lg p-4 ${
									isCurrent ? "border-blue-500 bg-blue-50" : "border-gray-200"
								}`}
							>
								<div className="flex items-center mb-2">
									<h3 className="font-medium">{envName}</h3>
									{isCurrent && (
										<span className="ml-2 px-2 py-1 bg-blue-500 text-white text-xs rounded">
											現在使用中
										</span>
									)}
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
									<div>
										<span className="text-gray-600">クラスタ:</span>{" "}
										<span className="font-mono">{config.cluster_name}</span>
									</div>
									<div>
										<span className="text-gray-600">ログ:</span>{" "}
										<span className="font-mono">{config.log_group_name}</span>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* ナビゲーション */}
			<div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h3 className="text-sm font-medium text-blue-800 mb-2">
					ナビゲーション
				</h3>
				<div className="flex gap-2">
					<a
						href="/"
						className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
					>
						ホームに戻る
					</a>
					<a
						href="/tasks"
						className="inline-flex items-center px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
					>
						タスク一覧
					</a>
				</div>
			</div>

			{/* 注意事項 */}
			<div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
				<h3 className="text-sm font-medium text-yellow-800 mb-2">注意事項</h3>
				<p className="text-sm text-yellow-700">
					環境の切り替えはセッション単位で動作します。
					ブラウザを再起動すると設定がリセットされ、デフォルト環境（staging）に戻ります。
				</p>
			</div>
		</div>
	);
}
