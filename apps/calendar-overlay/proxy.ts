// 오버레이 renderer 는 인증·라우팅이 없다 (Electron main 이 OAuth 담당, 단일 화면).
// proxy 는 아무 요청도 가로채지 않는 pass-through. (middleware.ts 금지 — proxy.ts 컨벤션 준수.)
// scripts/check-app-baseline.mjs 가 proxy.ts "존재"를 baseline 으로 강제.
import { NextResponse } from "next/server"

export function proxy() {
  return NextResponse.next()
}

export const config = { matcher: [] }
