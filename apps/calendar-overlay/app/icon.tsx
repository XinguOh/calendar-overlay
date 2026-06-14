import { ImageResponse } from "next/og"

// output:export(데스크톱 패키징) 호환 — 정적 생성 강제.
export const dynamic = "force-static"
export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // eslint-disable-next-line no-restricted-syntax -- ImageResponse 정적 아이콘: Tailwind 미지원 (raw 색)
        background: "#111318",
        color: "white",
        fontSize: 20,
        fontWeight: 700,
        borderRadius: 6,
      }}
    >
      C
    </div>,
    { ...size },
  )
}
