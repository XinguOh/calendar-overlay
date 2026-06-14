import type { MetadataRoute } from "next"

// output:export(데스크톱 패키징) 호환 — 정적 생성 강제. 일반 빌드엔 무해(이미 정적 데이터).
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calendar Overlay",
    short_name: "Overlay",
    start_url: "/",
    display: "standalone",
    background_color: "#111318",
    theme_color: "#111318",
  }
}
