import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendor and generated files
    "node_modules/**",
    "scripts/**",
    "tests/integration/**",
    "ha-addon/haspoolmanager/app/**",
    // video/ is its own Remotion project (own package.json + tsconfig + eslint)
    "video/**",
  ]),
]);

export default eslintConfig;
