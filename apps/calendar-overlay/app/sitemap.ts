import type { MetadataRoute } from "next"

// output:export(데스크톱 패키징) 호환 — 정적 생성 강제.
export const dynamic = "force-static"

// 오버레이는 비공개 단일 화면 — 색인 대상 없음.
export default function sitemap(): MetadataRoute.Sitemap {
  return []
}
