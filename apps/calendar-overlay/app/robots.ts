import type { MetadataRoute } from "next"

// output:export(데스크톱 패키징) 호환 — 정적 생성 강제.
export const dynamic = "force-static"

// 오버레이는 검색 비대상 — 전면 disallow.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  }
}
