// SM-2 inspired spaced repetition engine
export type CardKind = 'w' | 'k' | 's'; // word / kanji / sentence
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface SrsCard {
  key: string;            // e.g. "w:123"
  state: CardState;
  ease: number;           // 1.3..3.0
  interval: number;       // days
  due: number;            // epoch ms
  reps: number;
  lapses: number;
  addedAt: number;
  mode: 'fw' | 'rf';      // forward (recognition) / reverse (recall)
}

export interface ReviewLogEntry {
  key: string;
  ts: number;
  quality: 0 | 1 | 2 | 3 | 4 | 5;
  state: CardState;
  timeMs: number;
}

export const LEARNING_STEPS = [1 * 60_000, 6 * 60_000]; // 1min, 6min
export const GRADUATING_INTERVAL = 1;
export const EASY_INTERVAL = 4;
export const MIN_EASE = 1.3;

/** Learning-step presets (adjustable in Settings) */
export const LEARNING_STEP_PRESETS: Record<string, number[]> = {
  default: [1 * 60_000, 6 * 60_000],            // 1min, 6min
  fast: [30_000, 3 * 60_000],                   // aggressive: 30s, 3min
  intensive: [1 * 60_000, 10 * 60_000, 30 * 60_000], // extra graduation step
};

/** Mutable SRS config — the app shell syncs this from Settings on load/change. */
export const srsConfig = { steps: LEARNING_STEPS as number[] };

export function applyLearningSteps(preset: keyof typeof LEARNING_STEP_PRESETS | string): void {
  srsConfig.steps = LEARNING_STEP_PRESETS[preset] ?? LEARNING_STEPS;
}

export function newCard(key: string, mode: 'fw' | 'rf' = 'fw', now = Date.now()): SrsCard {
  return { key, state: 'new', ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, addedAt: now, mode };
}

/** quality: 0=blackout 3=correct w/ difficulty 5=perfect */
export function review(card: SrsCard, quality: number, now = Date.now()): SrsCard {
  const c: SrsCard = { ...card };
  c.reps += 1;
  if (quality < 3) {
    // lapse
    if (c.state === 'review' || c.state === 'relearning') c.lapses += 1;
    c.state = c.state === 'new' ? 'learning' : 'relearning';
    c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    const step = 0;
    c.due = now + srsConfig.steps[step];
    c.interval = 0;
    return c;
  }
  if (c.state === 'new' || c.state === 'learning') {
    // learning steps: progress through the configured step chain; last step (or Easy) graduates
    const steps = srsConfig.steps;
    if (quality >= 5) {
      c.state = 'review';
      c.interval = EASY_INTERVAL;
      c.due = now + c.interval * 86_400_000;
    } else if (quality >= 4) {
      // graduate to review with the standard graduating interval
      c.state = 'review';
      c.interval = GRADUATING_INTERVAL;
      c.due = now + c.interval * 86_400_000;
    } else {
      c.due = now + steps[0];
    }
    if (quality === 3) c.ease = Math.max(MIN_EASE, c.ease - 0.05);
    return c;
  }
  if (c.state === 'relearning') {
    c.state = 'review';
    c.interval = Math.max(1, Math.round(c.interval * 0.6));
    c.due = now + c.interval * 86_400_000;
    return c;
  }
  // review state
  c.ease = Math.max(MIN_EASE, Math.min(3.0, c.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))));
  if (quality === 3) c.interval = Math.round(c.interval * 1.2) + 1;
  else if (quality === 4) c.interval = Math.round(c.interval * c.ease);
  else c.interval = Math.round(c.interval * c.ease * 1.3);
  c.interval = Math.min(c.interval, 365 * 2);
  c.due = now + c.interval * 86_400_000;
  return c;
}

export function isDue(c: SrsCard, now = Date.now()): boolean {
  return c.due <= now;
}

export function formatInterval(days: number): string {
  if (days <= 0) return 'now';
  if (days < 1) return `${Math.round(days * 24 * 60)}m`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export const RETENTION_HALF_LIFE_DAYS = 3;
export function estimatedRetention(card: SrsCard, now = Date.now()): number {
  if (card.state === 'new' || card.interval === 0) return 0;
  const overdue = (now - card.due) / 86_400_000;
  const t = Math.max(0, card.interval + overdue);
  const strength = Math.max(0.5, card.interval / RETENTION_HALF_LIFE_DAYS) * Math.max(0.5, card.ease / 2.5);
  return Math.max(0.05, Math.min(0.99, Math.exp(-t / (strength * 8))));
}

// ---------------- forecast & streak analytics ----------------

export interface ForecastDay {
  label: string;      // "today" or "M/D"
  due: number;        // reviews due that day (overdue folded into today)
  fresh: number;      // projected new cards introduced that day
}

function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Project the next `days` days of SRS workload from the current card population. */
export function buildForecast(
  cards: Record<string, SrsCard>,
  newPerDay: number,
  days = 14,
  now = Date.now(),
): ForecastDay[] {
  const out: ForecastDay[] = [];
  const today = startOfToday(now);
  for (let i = 0; i < days; i++) {
    const d = new Date(today + i * 86_400_000);
    out.push({ label: i === 0 ? 'today' : `${d.getMonth() + 1}/${d.getDate()}`, due: 0, fresh: 0 });
  }
  let freshRemaining = 0;
  for (const c of Object.values(cards)) {
    if (c.state === 'new') { freshRemaining += 1; continue; }
    if (c.state === 'learning' || c.state === 'relearning') { out[0].due += 1; continue; }
    const dueDay = Math.floor((c.due - today) / 86_400_000);
    const idx = dueDay < 0 ? 0 : Math.min(dueDay, days - 1);
    out[idx].due += 1;
  }
  for (let i = 0; i < days && freshRemaining > 0; i++) {
    const add = Math.min(newPerDay, freshRemaining);
    out[i].fresh += add;
    freshRemaining -= add;
  }
  return out;
}

export function longestStreak(activity: Record<string, number>): number {
  const keys = Object.keys(activity).filter(k => activity[k] > 0).sort();
  if (keys.length === 0) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1] + 'T00:00:00');
    const d = new Date(keys[i] + 'T00:00:00');
    const diff = Math.round((d.getTime() - prev.getTime()) / 86_400_000);
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}
