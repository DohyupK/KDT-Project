/**
 * Similar-question detection.
 * Scenario: 의미가 비슷한 질문을 **연속** 3회 이상 → need_guideline.
 * Metric: normalized token Jaccard ≥ 0.8 on a consecutive streak from the latest message.
 */

const SIMILARITY_THRESHOLD = 0.8
const LOOKBACK = 20

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(text: string): Set<string> {
  const parts = normalize(text).split(' ').filter(Boolean)
  return new Set(parts)
}

export function jaccard(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) {
    if (tb.has(t)) inter += 1
  }
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

/** Consecutive similar streak ending at current (includes current as 1). */
export function countConsecutiveSimilar(
  currentMessage: string,
  previousUserMessages: string[],
  threshold = SIMILARITY_THRESHOLD,
): number {
  const recent = previousUserMessages.slice(-LOOKBACK)
  let count = 1
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (jaccard(currentMessage, recent[i]) >= threshold) {
      count += 1
    } else {
      break
    }
  }
  return count
}

export function needsGuideline(
  currentMessage: string,
  previousUserMessages: string[],
): boolean {
  return countConsecutiveSimilar(currentMessage, previousUserMessages) >= 3
}
