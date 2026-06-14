import { describe, expect, it } from "vitest"

import { layoutDay } from "../layout"

import type { NormalizedEvent } from "../types"

function ev(
  over: Partial<NormalizedEvent> & Pick<NormalizedEvent, "id" | "start" | "end">,
): NormalizedEvent {
  return {
    title: over.id,
    allDay: false,
    calendarId: "cal-1",
    colorHex: null,
    meetingUrl: null,
    recurring: false,
    ...over,
  }
}

// now 를 정시·모든 일정보다 이르게 둬 startTs 가 now 시각(정시)으로 고정 → topMin 결정적.
const NOW = new Date("2026-06-14T10:00:00+09:00")
const idOf = (b: { event: NormalizedEvent }) => b.event.id

// startTs 는 NOW 가 속한 날의 로컬 자정 → topMin 은 자정 기준. CI 타임존 독립을 위해 동적 산출.
const dayStart = (() => {
  const d = new Date(NOW)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()
const topMinOf = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60000)

describe("layoutDay", () => {
  it("포함 관계는 중첩 depth + 시간비례 topMin/durationMin", () => {
    const day = layoutDay(
      [
        ev({ id: "youtube", start: "2026-06-14T11:00:00+09:00", end: "2026-06-14T15:00:00+09:00" }),
        ev({ id: "lunch", start: "2026-06-14T12:00:00+09:00", end: "2026-06-14T13:00:00+09:00" }),
      ],
      NOW,
    )
    expect(day.blocks.map(idOf)).toEqual(["youtube", "lunch"]) // 시작순
    const parent = day.blocks[0]!
    const child = day.blocks[1]!
    expect(parent.depth).toBe(0)
    expect(child.depth).toBe(1) // 안에 든 일정
    expect(parent.topMin).toBe(topMinOf("2026-06-14T11:00:00+09:00")) // 자정 기준 오프셋
    expect(parent.durationMin).toBe(240)
    expect(child.topMin).toBe(topMinOf("2026-06-14T12:00:00+09:00"))
    expect(child.durationMin).toBe(60)
  })

  it("순차 비겹침은 모두 depth 0", () => {
    const day = layoutDay(
      [
        ev({ id: "a", start: "2026-06-14T11:00:00+09:00", end: "2026-06-14T12:00:00+09:00" }),
        ev({ id: "b", start: "2026-06-14T12:00:00+09:00", end: "2026-06-14T13:00:00+09:00" }),
      ],
      NOW,
    )
    expect(day.blocks.every((b) => b.depth === 0)).toBe(true)
  })

  it("같은 시작·끝 단조 아닌 부분겹침도 depth 정확(stale pop 회피)", () => {
    // B 가 A 를 감싸고(같은 시작, B 가 더 김), C 는 B 안·A 밖.
    const day = layoutDay(
      [
        ev({ id: "A", start: "2026-06-14T13:00:00+09:00", end: "2026-06-14T13:30:00+09:00" }),
        ev({ id: "B", start: "2026-06-14T13:00:00+09:00", end: "2026-06-14T15:00:00+09:00" }),
        ev({ id: "C", start: "2026-06-14T14:00:00+09:00", end: "2026-06-14T14:30:00+09:00" }),
      ],
      NOW,
    )
    const depth = Object.fromEntries(day.blocks.map((b) => [b.event.id, b.depth]))
    expect(depth).toEqual({ B: 0, A: 1, C: 1 }) // C 는 B 만 감싸므로 1 (A 는 이미 끝남)
  })

  it("종일 일정은 타임라인 밖 allDay 로 분리", () => {
    const day = layoutDay(
      [
        ev({
          id: "holiday",
          allDay: true,
          start: "2026-06-14T00:00:00",
          end: "2026-06-15T00:00:00",
        }),
        ev({ id: "mtg", start: "2026-06-14T11:00:00+09:00", end: "2026-06-14T11:30:00+09:00" }),
      ],
      NOW,
    )
    expect(day.blocks.map(idOf)).toEqual(["mtg"])
    expect(day.allDay.map((e) => e.id)).toEqual(["holiday"])
  })

  it("일정이 없어도 range 는 하루 전체(24h)이고 now 를 포함", () => {
    const day = layoutDay([], NOW)
    expect(day.blocks).toEqual([])
    expect(day.allDay).toEqual([])
    expect(day.totalMin).toBe(1440)
    expect(day.startTs).toBeLessThanOrEqual(NOW.getTime())
    expect(day.startTs + day.totalMin * 60000).toBeGreaterThan(NOW.getTime())
  })

  it("과거 일정만 있어도 하루 전체라 now 를 포함", () => {
    const day = layoutDay(
      [ev({ id: "past", start: "2026-06-14T08:00:00+09:00", end: "2026-06-14T09:00:00+09:00" })],
      NOW,
    )
    // 하루 전체(자정~자정) = 24h
    expect(day.totalMin).toBe(1440)
    expect(day.blocks[0]!.topMin).toBe(topMinOf("2026-06-14T08:00:00+09:00"))
    expect(day.blocks[0]!.durationMin).toBe(60)
  })
})
