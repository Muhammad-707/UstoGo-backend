/**
 * NPS (§6.1, MASTER_PROMPT.md): 9–10 = promoter, 7–8 = passive, 0–6 = detractor.
 * NPS = %promoters − %detractors, rounded to the nearest whole number — the
 * industry-standard formula. `null` when there is no data yet, so a master or
 * category with zero responses reads as "no NPS data", not a score of 0.
 */
export interface NpsBreakdown {
  readonly promoters: number;
  readonly passives: number;
  readonly detractors: number;
  readonly responseCount: number;
  readonly nps: number | null;
}

const PROMOTER_MIN = 9;
const PASSIVE_MIN = 7;

export const computeNps = (scores: readonly number[]): NpsBreakdown => {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const score of scores) {
    if (score >= PROMOTER_MIN) {
      promoters += 1;
    } else if (score >= PASSIVE_MIN) {
      passives += 1;
    } else {
      detractors += 1;
    }
  }

  const responseCount = scores.length;
  const nps =
    responseCount === 0 ? null : Math.round(((promoters - detractors) / responseCount) * 100);

  return { promoters, passives, detractors, responseCount, nps };
};
