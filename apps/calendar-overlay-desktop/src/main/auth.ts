import { createHash, randomBytes } from "node:crypto"
import { createServer } from "node:http"

import { shell } from "electron"

import type { AuthStatus } from "@repo/calendar"

import { env } from "../lib/env"

import {
  clearGrantedScopes,
  clearRefreshToken,
  loadGrantedScopes,
  loadRefreshToken,
  saveGrantedScopes,
  saveRefreshToken,
} from "./token-store"

// installed desktop app OAuth — system browser + PKCE + loopback 127.0.0.1.
// access token 은 메모리 캐시, refresh token 만 Keychain(token-store). granted scope 는 평문 보관.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
// calendar.events 는 읽기+쓰기를 모두 포함(별도 readonly scope 불필요). calendarlist 는 읽기 전용 유지.
// 데스크톱 앱은 incremental authorization 미지원 → 필요한 scope 를 한 번에 명시한다.
const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events"
const SCOPES = [WRITE_SCOPE, "https://www.googleapis.com/auth/calendar.calendarlist.readonly"].join(
  " ",
)

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  /** 공백 구분 granted scope. authorization_code·refresh_token 응답 모두 포함. */
  scope?: string
}

let accessToken: { token: string; expiresAt: number } | null = null
let accountEmail: string | null = null

// PKCE 만으로 충분하지만 Google "데스크톱 앱" 클라이언트는 토큰 교환에 client_secret 을
// 요구하는 경우가 있다. 설정돼 있으면 함께 보내고, 없으면 PKCE 단독으로 동작.
function tokenBody(fields: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams({ client_id: env.googleClientId, ...fields })
  if (env.googleClientSecret) params.set("client_secret", env.googleClientSecret)
  return params
}

/** calendar.ts 가 primary 캘린더 id(= 계정 이메일)를 넘겨준다. 토큰과 무관한 표시용. */
export function setAccountEmail(email: string | null): void {
  accountEmail = email
}

export function getAuthStatus(): AuthStatus {
  const signedIn = loadRefreshToken() !== null
  const scopes = loadGrantedScopes()
  // 쓰기 가능 = 로그인 + granted scope 에 calendar.events(쓰기) 포함. readonly 만이면 false → 재동의 배너.
  const canWrite = signedIn && scopes !== null && scopes.split(/\s+/).includes(WRITE_SCOPE)
  return { signedIn, email: accountEmail, canWrite }
}

/** 만료 60초 전이면 refresh. refresh token 무효(invalid_grant)면 폐기 후 throw. */
export async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.expiresAt - 60_000 > Date.now()) return accessToken.token

  const refreshToken = loadRefreshToken()
  if (!refreshToken) throw new Error("not_signed_in")

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody({ refresh_token: refreshToken, grant_type: "refresh_token" }),
  })
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      clearRefreshToken()
      clearGrantedScopes()
      accessToken = null
      accountEmail = null
    }
    throw new Error("token_refresh_failed")
  }
  const json = (await res.json()) as TokenResponse
  // refresh 응답에도 scope 가 오므로 최신화(self-heal — 사용자가 권한 일부 취소한 경우 반영).
  if (json.scope) saveGrantedScopes(json.scope)
  accessToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return accessToken.token
}

export async function signIn(): Promise<AuthStatus> {
  if (!env.googleClientId) throw new Error("missing_client_id")

  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const state = randomBytes(16).toString("base64url")
  const loopback = await startLoopback(state)
  const redirectUri = `http://127.0.0.1:${loopback.port}/callback`

  const authUrl =
    `${AUTH_ENDPOINT}?` +
    new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "select_account consent", // 계정 선택 화면 + 매 로그인 동의(refresh_token 보장) → 계정 전환 가능
    }).toString()

  await shell.openExternal(authUrl)

  try {
    const code = await loopback.codePromise
    const tokens = await exchangeCode(code, verifier, redirectUri)
    if (!tokens.refresh_token) throw new Error("no_refresh_token")
    saveRefreshToken(tokens.refresh_token)
    // 동의한 granted scope 저장 → 이후 canWrite 판정. prompt=consent 라 확장 scope 가 매번 갱신됨.
    if (tokens.scope) saveGrantedScopes(tokens.scope)
    accessToken = { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
  } finally {
    loopback.close()
  }
  return getAuthStatus()
}

export function signOut(): AuthStatus {
  clearRefreshToken()
  clearGrantedScopes()
  accessToken = null
  accountEmail = null
  return getAuthStatus()
}

async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody({
      code,
      code_verifier: verifier, // PKCE
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error("token_exchange_failed")
  return (await res.json()) as TokenResponse
}

type Loopback = { port: number; codePromise: Promise<string>; close: () => void }

// 127.0.0.1 랜덤 포트 1회성 콜백 서버. state 검증 + 5분 timeout.
function startLoopback(expectedState: string): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    let settle: (code: string) => void = () => {}
    let fail: (error: Error) => void = () => {}
    const codePromise = new Promise<string>((res, rej) => {
      settle = res
      fail = rej
    })

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "", "http://127.0.0.1")
      if (url.pathname !== "/callback") {
        res.writeHead(404)
        res.end()
        return
      }
      const error = url.searchParams.get("error")
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      res.writeHead(error || state !== expectedState || !code ? 400 : 200, {
        "Content-Type": "text/html; charset=utf-8",
      })
      if (error) {
        res.end("<p>로그인이 취소되었습니다. 이 창을 닫으세요.</p>")
        fail(new Error("oauth_denied"))
      } else if (state !== expectedState) {
        res.end("state mismatch")
        fail(new Error("state_mismatch"))
      } else if (!code) {
        res.end("no code")
        fail(new Error("no_code"))
      } else {
        res.end("<p>로그인 완료. 이 창을 닫아도 됩니다.</p>")
        settle(code)
      }
    })

    const timeout = setTimeout(() => {
      fail(new Error("oauth_timeout"))
      server.close()
    }, 5 * 60_000)
    void codePromise.finally(() => {
      clearTimeout(timeout)
      server.close()
    })

    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address === "object") {
        resolve({ port: address.port, codePromise, close: () => server.close() })
      } else {
        reject(new Error("loopback_no_port"))
      }
    })
  })
}
