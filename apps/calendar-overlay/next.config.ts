import type { NextConfig } from "next"

// CSP report-only — 오버레이 renderer 는 IPC(window.overlay) 만 쓰고 외부 네트워크 호출이 없다
// (Google API 는 전부 Electron main 이 호출). connect-src 'self' 로 충분.
// scripts/check-app-baseline.mjs 가 이 헤더(+보안 헤더 5종) 존재를 강제(삭제 시 커밋 거부).
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ")

// 데스크톱 패키징용 정적 export 분기. EXPORT=1 일 때만 output:"export"(Electron app:// 로 out/ 로드).
// Next 는 output:export 를 headers()·proxy(미들웨어) 와 함께 못 쓰고, file 로드라 응답 헤더도 무의미 →
// export 모드에서만 headers() 를 끈다. 일반(web) 빌드는 그대로 보안 헤더 유지(baseline 게이트가 강제).
const isExport = process.env.EXPORT === "1"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @repo/calendar 는 TS 소스를 그대로 export → Next 트랜스파일 대상에 포함.
  transpilePackages: ["@repo/calendar"],
}

if (isExport) {
  nextConfig.output = "export"
} else {
  nextConfig.headers = async (): Promise<
    Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  > => {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ]
  }
}

export default nextConfig
