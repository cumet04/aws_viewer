import environmentsConfig from "./environments.json";

// 環境設定の型定義
export interface EnvironmentConfig {
	cluster_name: string;
	main_container: string;
	log_group_name: string;
}

interface EnvironmentsConfig {
	envs: Record<string, EnvironmentConfig>;
}

// 現在使用する環境名をメモリ上に保持
let currentEnvironmentName: string;

// デフォルト環境名を取得する関数（environments.jsonの一番上の環境）
function getDefaultEnvironmentName(): string {
	const config = environmentsConfig as EnvironmentsConfig;
	const envNames = Object.keys(config.envs);
	if (envNames.length === 0) {
		throw new Error("No environments found in configuration");
	}
	return envNames[0];
}

// 初期化
currentEnvironmentName = getDefaultEnvironmentName();

/**
 * 環境を切り替えます
 * @param envName 設定する環境名
 */
export function setCurrentEnvironment(envName: string): void {
	const config = environmentsConfig as EnvironmentsConfig;

	if (!config.envs[envName]) {
		throw new Error(`Environment '${envName}' not found in configuration`);
	}

	currentEnvironmentName = envName;
}

/**
 * 現在の環境設定を取得します
 * @returns 現在の環境設定
 */
export function getCurrentEnvironmentConfig(): EnvironmentConfig {
	const config = environmentsConfig as EnvironmentsConfig;

	if (!config.envs[currentEnvironmentName]) {
		console.warn(
			`Environment '${currentEnvironmentName}' not found, falling back to default`,
		);
		const defaultEnv = getDefaultEnvironmentName();
		return config.envs[defaultEnv];
	}

	return config.envs[currentEnvironmentName];
}

/**
 * 現在の環境名を取得します
 * @returns 現在の環境名
 */
export function getCurrentEnvironmentName(): string {
	return currentEnvironmentName;
}

/**
 * 利用可能な環境名の一覧を取得します
 * @returns 環境名の配列
 */
export function getAvailableEnvironments(): string[] {
	const config = environmentsConfig as EnvironmentsConfig;
	return Object.keys(config.envs);
}

/**
 * 指定した環境の設定を取得します
 * @param envName 環境名
 * @returns 指定した環境の設定
 */
export function getEnvironmentConfig(envName: string): EnvironmentConfig {
	const config = environmentsConfig as EnvironmentsConfig;

	if (!config.envs[envName]) {
		throw new Error(`Environment '${envName}' not found in configuration`);
	}

	return config.envs[envName];
}
