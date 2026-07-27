import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

const packageRestrictions = {
  core: [
    "@web-scada/geometry",
    "@web-scada/renderer-svg",
    "@web-scada/symbols",
    "@web-scada/designer-engine",
    "@web-scada/runtime-engine",
    "@web-scada/web-components"
  ],
  geometry: [
    "@web-scada/core",
    "@web-scada/renderer-svg",
    "@web-scada/symbols",
    "@web-scada/designer-engine",
    "@web-scada/runtime-engine",
    "@web-scada/web-components"
  ],
  "renderer-svg": [
    "@web-scada/designer-engine",
    "@web-scada/runtime-engine",
    "@web-scada/web-components"
  ],
  symbols: [
    "@web-scada/renderer-svg",
    "@web-scada/designer-engine",
    "@web-scada/runtime-engine",
    "@web-scada/web-components"
  ],
  "designer-engine": ["@web-scada/runtime-engine", "@web-scada/web-components"],
  "runtime-engine": ["@web-scada/designer-engine", "@web-scada/web-components"],
  "interaction-engine": [
    "@web-scada/core",
    "@web-scada/renderer-svg",
    "@web-scada/symbols",
    "@web-scada/designer-engine",
    "@web-scada/runtime-engine",
    "@web-scada/web-components"
  ]
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({ ...config, files: ["**/*.ts"] })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({ ...config, files: ["**/*.ts"] })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser
    },
    plugins: { "import-x": importPlugin },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "import-x/no-cycle": "error",
      "import-x/no-internal-modules": ["error", { allow: ["**/src/**", "vitest/**"] }]
    }
  },
  ...Object.entries(packageRestrictions).map(([name, paths]) => ({
    files: [`packages/${name}/src/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: paths.map((path) => ({
            name: path,
            message: `Invalid dependency direction from ${name}.`
          }))
        }
      ]
    }
  }))
);
