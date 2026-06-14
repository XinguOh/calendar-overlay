import { describe, expect, it } from "vitest"

import { selectOverlay } from "../select"

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

// 모든 ISO 에 동일 +09:00 offset 을 써서 Date.parse 비교가 결정적이도록 한다.
const NOW = new Date("2026-06-14T10:00:00+09:00")

describe("selectOverlay", () => {
  it("진행 중 일정이 있으면 in-event + 남은 시간", () => {
    const events = [
      ev({ id: "a", start: "2026-06-14T09:30:00+09:00", end: "2026-06-14T10:30:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.now.kind).toBe("in-event")
    if (sel.now.kind === "in-event") {
      expect(sel.now.event.id).toBe("a")
      expect(sel.now.remainingMs).toBe(30 * 60 * 1000)
    }
  })

  it("진행 중 일정이 여럿이면 가장 먼저 끝나는 것을 지금으로", () => {
    const events = [
      ev({ id: "long", start: "2026-06-14T09:00:00+09:00", end: "2026-06-14T12:00:00+09:00" }),
      ev({ id: "short", start: "2026-06-14T09:45:00+09:00", end: "2026-06-14T10:15:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.now.kind).toBe("in-event")
    if (sel.now.kind === "in-event") expect(sel.now.event.id).toBe("short")
  })

  it("진행 중이 없으면 free + 다음 일정까지 남은 시간", () => {
    const events = [
      ev({ id: "next", start: "2026-06-14T11:00:00+09:00", end: "2026-06-14T11:30:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.now.kind).toBe("free")
    if (sel.now.kind === "free") {
      expect(sel.now.next?.event.id).toBe("next")
      expect(sel.now.next?.startsInMs).toBe(60 * 60 * 1000)
    }
  })

  it("일정이 아예 없으면 free + next=null", () => {
    const sel = selectOverlay([], NOW)
    expect(sel.now.kind).toBe("free")
    if (sel.now.kind === "free") expect(sel.now.next).toBeNull()
    expect(sel.upcoming).toEqual([])
  })

  it("upcoming 은 now 이후 가까운 순 최대 2개", () => {
    const events = [
      ev({ id: "n1", start: "2026-06-14T11:00:00+09:00", end: "2026-06-14T11:30:00+09:00" }),
      ev({ id: "n3", start: "2026-06-14T14:00:00+09:00", end: "2026-06-14T15:00:00+09:00" }),
      ev({ id: "n2", start: "2026-06-14T12:00:00+09:00", end: "2026-06-14T13:00:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.upcoming.map((e) => e.id)).toEqual(["n1", "n2"])
  })

  it("all-day 일정은 지금/다음 후보에서 제외", () => {
    const events = [
      ev({
        id: "holiday",
        allDay: true,
        start: "2026-06-14T00:00:00",
        end: "2026-06-15T00:00:00",
      }),
      ev({ id: "mtg", start: "2026-06-14T11:00:00+09:00", end: "2026-06-14T11:30:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.now.kind).toBe("free")
    if (sel.now.kind === "free") expect(sel.now.next?.event.id).toBe("mtg")
    expect(sel.upcoming.map((e) => e.id)).toEqual(["mtg"])
  })

  it("이미 끝난 일정은 무시", () => {
    const events = [
      ev({ id: "past", start: "2026-06-14T08:00:00+09:00", end: "2026-06-14T09:00:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.now.kind).toBe("free")
    if (sel.now.kind === "free") expect(sel.now.next).toBeNull()
  })

  it("범위 끝(내일 10:00) 직전 일정도 다음으로 잡힌다", () => {
    const events = [
      ev({ id: "edge", start: "2026-06-15T09:30:00+09:00", end: "2026-06-15T10:00:00+09:00" }),
    ]
    const sel = selectOverlay(events, NOW)
    expect(sel.now.kind).toBe("free")
    if (sel.now.kind === "free") expect(sel.now.next?.event.id).toBe("edge")
  })
})
