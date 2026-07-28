import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  globalIgnores([".next/**", "dist/**", "build/**", "public/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "max-lines": [
        "error",
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
      // react-hooks 7 adds React-Compiler-oriented rules. We keep the plugin
      // but opt out of the two that flag intentional patterns here: setState
      // inside data-fetch/async effects, and imperative mutation of three.js
      // objects (OrbitControls) — not React state — inside effects.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
  },
  {
    files: ["src/shared/infrastructure/api/dto.ts"],
    rules: { "max-lines": "off" },
  },
);
