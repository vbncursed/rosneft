import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "public/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "max-lines": [
        "error",
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
      // Migrating off Next: <a href> to not-yet-migrated SPA routes is deliberate
      // (TanStack <Link> needs the route to exist). This Next-only rule fights it.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["src/shared/infrastructure/api/dto.ts"],
    rules: { "max-lines": "off" },
  },
]);

export default eslintConfig;
