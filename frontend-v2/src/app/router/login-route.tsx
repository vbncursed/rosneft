import { LoginPage, useLogin } from "@/pages/login";

// Its own file, not inlined in routes.tsx: a top-level function that calls a
// hook must be named (react-hooks/rules-of-hooks needs the uppercase-name
// convention to recognize it as a component), and a file mixing a named
// component with route consts trips react/only-export-components. Wiring
// either way — the decision lives in useLogin, which has its own spec.
export function LoginRouteComponent() {
  return <LoginPage {...useLogin()} />;
}
