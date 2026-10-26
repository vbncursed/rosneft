import type { Plugin } from "vite";

const PDFJS_PREFIX = "/pdfjs/";

/**
 * Drops the bare `import` query from a URL under /pdfjs/. Vite's dev server
 * appends `?import` to dynamic imports and then refuses to transform anything
 * in public/; without the marker it serves the vendored file as it is.
 */
export function stripImportQuery(url: string): string {
  const at = url.indexOf("?");
  if (at < 0 || !url.startsWith(PDFJS_PREFIX)) return url;
  const rest = url
    .slice(at + 1)
    .split("&")
    .filter((param) => param !== "import");
  return rest.length > 0 ? `${url.slice(0, at)}?${rest.join("&")}` : url.slice(0, at);
}

export function pdfjsDev(): Plugin {
  return {
    name: "andrey:pdfjs-dev",
    apply: "serve",
    configureServer(server) {
      // Registered directly, not returned: it must run before Vite's transform middleware.
      server.middlewares.use((req, _res, next) => {
        if (req.url) req.url = stripImportQuery(req.url);
        next();
      });
    },
  };
}
