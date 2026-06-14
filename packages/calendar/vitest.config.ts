import { defineConfig } from "vitest/config"

/**
 * @repo/calendar 테스트 설정.
 *
 * - environment: "node" — normalizeEvents / selectOverlay 순수 함수가 타깃. DOM 불필요.
 * - globals: false — describe/it/expect 명시 import (모노레포 정합).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.ts", "src/**/__tests__/**/*.{test,spec}.ts"],
  },
})
