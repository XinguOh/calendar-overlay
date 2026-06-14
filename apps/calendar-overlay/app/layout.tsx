import type { ReactNode } from "react"

import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Calendar Overlay",
  description: "지금/다음 일정을 조용히 보여주는 오버레이",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
