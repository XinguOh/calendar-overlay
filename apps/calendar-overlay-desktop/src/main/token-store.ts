import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { app, safeStorage } from "electron"

// refresh token 을 safeStorage(macOS 는 Keychain 으로 보호된 키) 로 암호화해 userData 에 저장한다.
// 평문 토큰은 디스크에 닿지 않고, renderer 에는 어떤 경로로도 노출되지 않는다.

function authPath(): string {
  return join(app.getPath("userData"), "auth.enc")
}

// granted scope 는 비밀이 아니다(어떤 권한을 동의했는지 메타) — 평문 저장. 토큰과 분리.
function scopesPath(): string {
  return join(app.getPath("userData"), "scopes.txt")
}

export function saveRefreshToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage 사용 불가 — Keychain 접근 실패")
  }
  writeFileSync(authPath(), safeStorage.encryptString(token))
}

export function loadRefreshToken(): string | null {
  const path = authPath()
  if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(path))
  } catch {
    return null
  }
}

export function clearRefreshToken(): void {
  const path = authPath()
  if (existsSync(path)) rmSync(path)
}

// 토큰 응답의 granted scope 문자열(공백 구분)을 그대로 보관 → "쓰기 가능 여부" 판정 근거.
export function saveGrantedScopes(scope: string): void {
  writeFileSync(scopesPath(), scope, "utf8")
}

export function loadGrantedScopes(): string | null {
  const path = scopesPath()
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, "utf8")
  } catch {
    return null
  }
}

export function clearGrantedScopes(): void {
  const path = scopesPath()
  if (existsSync(path)) rmSync(path)
}
