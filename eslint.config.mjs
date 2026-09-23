import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Screens show real data or say there is none (H6). Mock data is for tests
  // and the admin drill page only.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/test-utils/**", "src/lib/mock-data/**", "src/app/admin/simulation/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "(^@/lib/|/)mock-data(/|$)", message: "Mock data is for tests and /admin/simulation only." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
