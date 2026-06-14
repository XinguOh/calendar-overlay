import js from "@eslint/js"
import nextPlugin from "@next/eslint-plugin-next"
import tseslint from "typescript-eslint"

// 단독 OSS repo 용 가벼운 flat config. (원 모노레포의 엄격 룰셋은 가져오지 않음 — 코드는 거기서 이미 검증됨.)
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/release/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/calendar-overlay/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      // TS 가 미정의 식별자를 잡으므로 no-undef 는 끈다(브라우저·Node 글로벌 오탐 방지).
      "no-undef": "off",
      "no-empty": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
)
