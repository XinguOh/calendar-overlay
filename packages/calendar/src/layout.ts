import type { DayBlock, DayLayout, NormalizedEvent } from "./types"

const MS_PER_MIN = 60000

function floorToHour(ts: number): number {
  const d = new Date(ts)
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

function ceilToHour(ts: number): number {
  const d = new Date(ts)
  if (d.getMinutes() !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0) {
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
  }
  return d.getTime()
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(ts: number): number {
  // 다음날 0시 = 당일 24시.
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

/**
 * 정규화된 일정 + 현재 시각 → 하루 타임라인 레이아웃.
 *
 * - timed 일정만 타임라인에 배치(종일은 allDay 로 분리 — 시간 점유가 아님).
 * - range 는 기본이 하루 전체(로컬 자정~자정). 일정이 자정을 넘어가면 그만큼만 확장 — 일정이 없어도 24h 스크롤 가능, now-line·now 자동스크롤은 now 가 항상 그날 안이라 그대로.
 * - depth: 다른 일정에 (시간상) 포함/겹쳐 시작하면 그 안에 든 깊이. 스택 기반 — 시작 오름차순,
 *   같은 시작이면 끝 내림차순(컨테이너 먼저)으로 정렬해 포함 관계를 깊이로 환산한다.
 *   renderer 가 depth 만큼 왼쪽 들여쓰기 + 위 레이어로 그려 구글 캘린더식 중첩을 낸다.
 */
export function layoutDay(events: NormalizedEvent[], now: Date): DayLayout {
  const timed = events.filter((e) => !e.allDay)
  const allDay = events.filter((e) => e.allDay)
  const nowTs = now.getTime()

  const bounds = timed.flatMap((e) => [Date.parse(e.start), Date.parse(e.end)])
  const dayStart = startOfDay(nowTs)
  const dayEnd = endOfDay(nowTs)
  // 하루 전체(로컬 자정~자정)를 기본 범위로 깔아 일정이 없어도 24h 스크롤 가능.
  // 일정이 그 밖으로 벗어나면(자정 넘김 등) 그만큼만 확장.
  const startTs = floorToHour(Math.min(dayStart, ...(bounds.length ? bounds : [dayStart])))
  const endTs = ceilToHour(Math.max(dayEnd, ...(bounds.length ? bounds : [dayEnd])))
  const totalMin = Math.max(60, Math.round((endTs - startTs) / MS_PER_MIN))

  // 컨테이너(먼저 시작·늦게 끝)가 앞서도록 정렬.
  const spans = timed
    .map((event) => ({ event, s: Date.parse(event.start), e: Date.parse(event.end) }))
    .sort((a, b) => (a.s !== b.s ? a.s - b.s : b.e - a.e))

  // depth = 자기보다 앞선 일정 중 자기 시작 시점에 아직 안 끝난 것의 수.
  // 끝이 단조롭지 않은 부분겹침도 정확(스택 tail-pop 의 stale 문제 회피).
  const blocks: DayBlock[] = spans.map((span, i) => {
    let depth = 0
    for (let j = 0; j < i; j++) {
      if (spans[j]!.e > span.s) depth++
    }
    return {
      event: span.event,
      topMin: Math.round((span.s - startTs) / MS_PER_MIN),
      durationMin: Math.max(1, Math.round((span.e - span.s) / MS_PER_MIN)),
      depth,
    }
  })

  return { startTs, totalMin, blocks, allDay }
}
