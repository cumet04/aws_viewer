import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("/tasks/:id", "routes/tasks/show.tsx"),
] satisfies RouteConfig;
