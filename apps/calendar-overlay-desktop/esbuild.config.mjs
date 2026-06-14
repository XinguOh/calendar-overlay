// Electron main + preload 번들러. sandbox preload 는 self-contained CJS 여야 하고 electron 만
// require 가능 → main·preload 모두 CJS 출력, electron 은 external(런타임 제공). @repo/calendar 의
// TS 소스는 main 번들에 인라인된다. tsc 는 typecheck 전용(noEmit) — 빌드는 전적으로 esbuild.
import { existsSync } from "node:fs"

import { build, context } from "esbuild"

const watch = process.argv.includes("--watch")

// 빌드 시 .env.local(GOOGLE_CLIENT_ID)을 번들에 구워넣어(define) 배포본이 별도 파일 없이 로그인되게 한다.
// desktop OAuth client_id 는 비밀이 아님(PKCE + 사용자 본인 동의가 보안). 값은 dist/(gitignore)에만 박힌다.
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) {
    process.loadEnvFile(f)
    break
  }
}

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
  define: {
    "process.env.GOOGLE_CLIENT_ID": JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ""),
    "process.env.GOOGLE_CLIENT_SECRET": JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? ""),
  },
}

const entries = [
  { entryPoints: ["src/main/index.ts"], outfile: "dist/main.js" },
  { entryPoints: ["src/preload/index.ts"], outfile: "dist/preload.js" },
]

if (watch) {
  const contexts = await Promise.all(entries.map((e) => context({ ...common, ...e })))
  await Promise.all(contexts.map((c) => c.watch()))
  console.log("esbuild: watching main + preload…")
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })))
}
