/**
 * Lightsail: LOT_SCORE_ON_AWS=0 → backend does not call /predict-voting.
 * This PC `npm run score-pc` always scores (SCORE_PROCESS=1).
 */
export function lotScoreOnAws(): boolean {
  if ((process.env.SCORE_PROCESS ?? '').trim() === '1') return true
  const v = (process.env.LOT_SCORE_ON_AWS ?? '1').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
}
