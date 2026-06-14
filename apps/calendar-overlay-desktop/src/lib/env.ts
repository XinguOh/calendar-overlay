import { existsSync } from "node:fs"
import { join } from "node:path"

import { app } from "electron"

// 데스크톱 앱의 env 단일 진입점. process.env 는 여기서만 읽는다
// (ESLint 전역 process.env 금지의 예외 경로: **/lib/env*.ts).
// installed-app 의 client_id 는 비밀이 아니다(PKCE 가 보안 담당) — refresh token 만 Keychain 보호.

// dev: 번들 위치(dist/) 기준 앱 루트의 .env.local → .env (cwd 무관, __dirname 기준, Node 20.12+ 내장).
// 패키지 빌드: asar 안엔 .env 가 없으므로 userData(~/Library/Application Support/<productName>/)도 탐색 —
// 사용자가 거기에 .env.local(GOOGLE_CLIENT_ID)을 두면 패키지 앱이 읽는다. (전부 gitignore/비커밋.)
for (const path of [
  join(__dirname, "..", ".env.local"),
  join(__dirname, "..", ".env"),
  join(app.getPath("userData"), ".env.local"),
  join(app.getPath("userData"), ".env"),
]) {
  if (existsSync(path)) {
    process.loadEnvFile(path)
    break
  }
}

export const env = {
  /** Google Cloud Console 의 "Desktop app" OAuth client ID. */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  /** client secret — PKCE 만으로 충분하나 있으면 토큰 교환에 함께 전송. 선택. */
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  /** renderer(Next) URL. dev/smoke 기본 localhost:3010. */
  overlayUrl: process.env.OVERLAY_URL ?? "http://localhost:3010",
}
