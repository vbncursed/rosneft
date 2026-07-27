import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  globalIgnores([".next/**", "dist/**", "build/**", "public/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs["recommended-latest"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "max-lines": [
        "error",
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["src/shared/infrastructure/api/dto.ts"],
    rules: { "max-lines": "off" },
  },
);
