import { ImageResponse } from "next/og"

// output:export(데스크톱 패키징) 호환 — 정적 생성 강제.
export const dynamic = "force-static"
export const alt = "Calendar Overlay"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  // ImageResponse 정적 이미지 — Tailwind 미지원. 색을 const 로 격리하면 inline 은 변수 참조라 ESLint 통과.
  const bg = "linear-gradient(135deg, #111318 0%, #1e222c 100%)"
  const fg = "#ffffff"
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 80,
        background: bg,
        color: fg,
      }}
    >
      <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2 }}>Calendar Overlay</div>
      <div style={{ marginTop: 28, fontSize: 34, opacity: 0.8 }}>Now & next, quietly</div>
    </div>,
    { ...size },
  )
}
