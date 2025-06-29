import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	isRouteErrorResponse,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	// より詳細なエラー情報を取得を試みる
	let errorDetails = details;
	if (error && typeof error === 'object') {
		if ('message' in error && typeof error.message === 'string') {
			errorDetails = error.message;
		}
		// 追加のエラー情報があれば使用
		if ('cause' in error && error.cause) {
			errorDetails += ` (Cause: ${error.cause})`;
		}
	}

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		if (error.message.includes("is not authorized to perform")) {
			message = "AWS permission error";
		} else if (
			error.message.includes(
				"The security token included in the request is expired",
			)
		) {
			message = "AWS token expired";
		} else {
			stack = error.stack;
		}
		details = error.message;
	} else if (error && error instanceof Error) {
		// Production環境でも基本的なエラー情報は表示
		if (error.message.includes("is not authorized to perform")) {
			message = "AWS permission error";
			details = "AWS権限が不足しています。必要な権限を確認してください。";
		} else if (
			error.message.includes(
				"The security token included in the request is expired",
			)
		) {
			message = "AWS token expired";
			details = "AWSトークンの有効期限が切れています。再認証してください。";
		} else {
			// 一般的なエラーの場合、エラーメッセージを表示
			details = errorDetails;
		}
	}

	return (
		<main className="pt-16 p-4 container mx-auto">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full p-4 overflow-x-auto">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
