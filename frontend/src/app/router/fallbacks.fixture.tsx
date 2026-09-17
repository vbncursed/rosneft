import type { ErrorComponentProps } from "@tanstack/react-router";
import { NoConsoleAccess, NotFound, RouteError } from "./fallbacks";

const props = {
  error: new Error("Scene bundle unavailable"),
  reset: () => {},
  info: undefined,
} as unknown as ErrorComponentProps;

export default {
  notFound: <NotFound />,
  routeError: <RouteError {...props} />,
  noConsoleAccess: <NoConsoleAccess />,
};
