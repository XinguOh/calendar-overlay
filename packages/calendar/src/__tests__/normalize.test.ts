import { describe, expect, it } from "vitest"

import { normalizeEvent, normalizeEvents } from "../normalize"

import type { RawCalendarEvent } from "../types"

function raw(event: RawCalendarEvent["event"], over?: Partial<RawCalendarEvent>): RawCalendarEvent {
  return { event, calendarId: "cal-1", calendarColorHex: "#3b82f6", ...over }
}

describe("normalizeEvent", () => {
  it("timed 일정을 정규화한다", () => {
    const n = normalizeEvent(
      raw({
        id: "e1",
        summary: "스탠드업",
        start: { dateTime: "2026-06-14T09:00:00+09:00" },
        end: { dateTime: "2026-06-14T09:30:00+09:00" },
      }),
    )
    expect(n).not.toBeNull()
    expect(n?.id).toBe("e1")
    expect(n?.title).toBe("스탠드업")
    expect(n?.allDay).toBe(false)
    expect(n?.start).toBe("2026-06-14T09:00:00+09:00")
    expect(n?.colorHex).toBe("#3b82f6")
  })

  it("all-day 일정은 allDay=true 로 자정 ISO 를 만든다", () => {
    const n = normalizeEvent(
      raw({
        id: "h1",
        summary: "휴가",
        start: { date: "2026-06-14" },
        end: { date: "2026-06-15" },
      }),
    )
    expect(n?.allDay).toBe(true)
    expect(n?.start).toBe("2026-06-14T00:00:00")
    expect(n?.end).toBe("2026-06-15T00:00:00")
  })

  it("hangoutLink 를 회의 링크로 잡는다", () => {
    const n = normalizeEvent(
      raw({
        id: "m1",
        summary: "회의",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      }),
    )
    expect(n?.meetingUrl).toBe("https://meet.google.com/abc-defg-hij")
  })

  it("conferenceData video entryPoint 를 회의 링크로 잡는다", () => {
    const n = normalizeEvent(
      raw({
        id: "m2",
        summary: "회의",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+82-2-000-0000" },
            { entryPointType: "video", uri: "https://zoom.us/j/123" },
          ],
        },
      }),
    )
    expect(n?.meetingUrl).toBe("https://zoom.us/j/123")
  })

  it("회의 링크가 없으면 description 내 첫 URL 을 fallback 한다", () => {
    const n = normalizeEvent(
      raw({
        id: "m3",
        summary: "원격",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
        description: "참여: https://example.com/room 비번 1234",
      }),
    )
    expect(n?.meetingUrl).toBe("https://example.com/room")
  })

  it("회의 링크가 어디에도 없으면 null", () => {
    const n = normalizeEvent(
      raw({
        id: "m4",
        summary: "점심",
        start: { dateTime: "2026-06-14T12:00:00+09:00" },
        end: { dateTime: "2026-06-14T13:00:00+09:00" },
      }),
    )
    expect(n?.meetingUrl).toBeNull()
  })

  it("event.colorId 가 colorMap 에 있으면 캘린더 색보다 우선", () => {
    const n = normalizeEvent(
      raw({
        id: "c1",
        summary: "색",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
        colorId: "5",
      }),
      { "5": "#f59e0b" },
    )
    expect(n?.colorHex).toBe("#f59e0b")
  })

  it("취소된 일정은 null", () => {
    const n = normalizeEvent(
      raw({ id: "x1", status: "cancelled", start: { dateTime: "2026-06-14T10:00:00+09:00" } }),
    )
    expect(n).toBeNull()
  })

  it("시작/종료가 없으면 null", () => {
    expect(normalizeEvent(raw({ id: "x2", summary: "깨진 것" }))).toBeNull()
  })

  it("제목이 없으면 (제목 없음)", () => {
    const n = normalizeEvent(
      raw({
        id: "t1",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
      }),
    )
    expect(n?.title).toBe("(제목 없음)")
  })

  it("recurringEventId 가 있으면 recurring=true (반복 인스턴스 → 읽기전용)", () => {
    const n = normalizeEvent(
      raw({
        id: "r1_20260614T000000Z",
        summary: "주간 회의",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
        recurringEventId: "r1",
      }),
    )
    expect(n?.recurring).toBe(true)
  })

  it("recurringEventId 가 없으면 recurring=false (단일 일정 → 편집 가능)", () => {
    const n = normalizeEvent(
      raw({
        id: "s1",
        summary: "단일 일정",
        start: { dateTime: "2026-06-14T10:00:00+09:00" },
        end: { dateTime: "2026-06-14T11:00:00+09:00" },
      }),
    )
    expect(n?.recurring).toBe(false)
  })
})

describe("normalizeEvents", () => {
  it("recurring 으로 펼쳐진 인스턴스들을 시작 순으로 정렬하고 취소 항목을 거른다", () => {
    const list = normalizeEvents([
      raw({
        id: "r3",
        summary: "주간",
        start: { dateTime: "2026-06-14T15:00:00+09:00" },
        end: { dateTime: "2026-06-14T15:30:00+09:00" },
      }),
      raw({ id: "rx", status: "cancelled", start: { dateTime: "2026-06-14T11:00:00+09:00" } }),
      raw({
        id: "r1",
        summary: "주간",
        start: { dateTime: "2026-06-14T09:00:00+09:00" },
        end: { dateTime: "2026-06-14T09:30:00+09:00" },
      }),
    ])
    expect(list.map((e) => e.id)).toEqual(["r1", "r3"])
  })
})
