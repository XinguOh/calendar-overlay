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

/**
 * 정규화된 일정 + 현재 시각 → 하루 타임라인 레이아웃.
 *
 * - timed 일정만 타임라인에 배치(종일은 allDay 로 분리 — 시간 점유가 아님).
 * - range 는 가장 이른 시작 ~ 가장 늦은 끝(시 단위로 정렬), now 도 포함해 now-line 이 항상 보이게.
 * - depth: 다른 일정에 (시간상) 포함/겹쳐 시작하면 그 안에 든 깊이. 스택 기반 — 시작 오름차순,
 *   같은 시작이면 끝 내림차순(컨테이너 먼저)으로 정렬해 포함 관계를 깊이로 환산한다.
 *   renderer 가 depth 만큼 왼쪽 들여쓰기 + 위 레이어로 그려 구글 캘린더식 중첩을 낸다.
 */
export function layoutDay(events: NormalizedEvent[], now: Date): DayLayout {
  const timed = events.filter((e) => !e.allDay)
  const allDay = events.filter((e) => e.allDay)
  const nowTs = now.getTime()

  const bounds = timed.flatMap((e) => [Date.parse(e.start), Date.parse(e.end)])
  const minTs = Math.min(nowTs, ...(bounds.length ? bounds : [nowTs]))
  const maxTs = Math.max(nowTs, ...(bounds.length ? bounds : [nowTs]))

  const startTs = floorToHour(minTs)
  const endTs = ceilToHour(maxTs)
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
