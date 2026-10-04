// Achievements / badges engine
import type { StudyState } from './stores';
import type { LibraryState } from './stores';

export interface Achievement {
  id: string;
  name: string;
  jp: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  check: (ctx: AchievementContext) => boolean;
  /** numeric progress toward the unlock, for progress bars on locked badges */
  progress?: (ctx: AchievementContext) => { cur: number; target: number };
}

export interface AchievementContext {
  cards: StudyState['cards'];
  reviewLog: StudyState['reviewLog'];
  quizLog: StudyState['quizLog'];
  activity: StudyState['activity'];
  favoritesCount: number;
  listsCount: number;
  listItems: number;
  tagsCount: number;
  notesCount: number;
  searches: number;
}

function totalReviews(ctx: AchievementContext) { return ctx.reviewLog.length + ctx.quizLog.reduce((a, q) => a + q.total, 0); }
function streakDays(ctx: AchievementContext): number {
  const days = Object.keys(ctx.activity).sort();
  if (!days.length) return 0;
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (ctx.activity[key]) streak++;
    else if (streak > 0 || days[0] === key) break;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-search', name: 'First Step', jp: '初めの一歩', description: 'Perform your first search', icon: '🔍', tier: 'bronze', check: c => c.searches >= 1, progress: c => ({ cur: c.searches, target: 1 }) },
  { id: 'search-100', name: 'Curious Mind', jp: '好奇心', description: 'Perform 100 searches', icon: '🧭', tier: 'silver', check: c => c.searches >= 100, progress: c => ({ cur: c.searches, target: 100 }) },
  { id: 'add-10', name: 'Collector', jp: '収集家', description: 'Add 10 entries to lists', icon: '📋', tier: 'bronze', check: c => c.listItems >= 10, progress: c => ({ cur: c.listItems, target: 10 }) },
  { id: 'add-100', name: 'Curator', jp: '管理人', description: 'Add 100 entries to lists', icon: '🗂️', tier: 'gold', check: c => c.listItems >= 100, progress: c => ({ cur: c.listItems, target: 100 }) },
  { id: 'fav-10', name: 'Cherished', jp: '大切なもの', description: 'Favorite 10 entries', icon: '⭐', tier: 'bronze', check: c => c.favoritesCount >= 10, progress: c => ({ cur: c.favoritesCount, target: 10 }) },
  { id: 'tag-5', name: 'Organizer', jp: '整理上手', description: 'Create 5 tags', icon: '🏷️', tier: 'bronze', check: c => c.tagsCount >= 5, progress: c => ({ cur: c.tagsCount, target: 5 }) },
  { id: 'note-10', name: 'Journalist', jp: '記録者', description: 'Write 10 notes', icon: '📝', tier: 'silver', check: c => c.notesCount >= 10, progress: c => ({ cur: c.notesCount, target: 10 }) },
  { id: 'lists-3', name: 'Librarian', jp: '図書委員', description: 'Create 3 study lists', icon: '📚', tier: 'bronze', check: c => c.listsCount >= 3, progress: c => ({ cur: c.listsCount, target: 3 }) },
  { id: 'review-1', name: 'Beginner', jp: '見習い', description: 'Complete your first review', icon: '🌱', tier: 'bronze', check: c => totalReviews(c) >= 1, progress: c => ({ cur: totalReviews(c), target: 1 }) },
  { id: 'review-50', name: 'Apprentice', jp: '弟子', description: '50 total reviews', icon: '🎋', tier: 'bronze', check: c => totalReviews(c) >= 50, progress: c => ({ cur: totalReviews(c), target: 50 }) },
  { id: 'review-200', name: 'Dedicated', jp: '熱心', description: '200 total reviews', icon: '🎍', tier: 'silver', check: c => totalReviews(c) >= 200, progress: c => ({ cur: totalReviews(c), target: 200 }) },
  { id: 'review-1000', name: 'Persistent', jp: '継続は力なり', description: '1,000 total reviews', icon: '🗼', tier: 'gold', check: c => totalReviews(c) >= 1000, progress: c => ({ cur: totalReviews(c), target: 1000 }) },
  { id: 'review-5000', name: 'Master Student', jp: '修行者', description: '5,000 total reviews', icon: '⛩️', tier: 'platinum', check: c => totalReviews(c) >= 5000, progress: c => ({ cur: totalReviews(c), target: 5000 }) },
  { id: 'streak-3', name: 'Warming Up', jp: '三日坊主脱出', description: '3-day study streak', icon: '🔥', tier: 'bronze', check: c => streakDays(c) >= 3, progress: c => ({ cur: streakDays(c), target: 3 }) },
  { id: 'streak-7', name: 'One Week', jp: '一週間', description: '7-day study streak', icon: '🌋', tier: 'silver', check: c => streakDays(c) >= 7, progress: c => ({ cur: streakDays(c), target: 7 }) },
  { id: 'streak-30', name: 'Unbreakable', jp: '不撓不屈', description: '30-day study streak', icon: '💎', tier: 'gold', check: c => streakDays(c) >= 30, progress: c => ({ cur: streakDays(c), target: 30 }) },
  { id: 'quiz-perfect', name: 'Flawless', jp: '満点', description: 'Score 100% on a 10+ question quiz', icon: '🎯', tier: 'silver', check: c => c.quizLog.some(q => q.total >= 10 && q.correct === q.total), progress: c => ({ cur: Math.min(10, c.quizLog.filter(q => q.total >= 10).reduce((a, q) => Math.max(a, q.correct === q.total ? 10 : q.correct), 0)), target: 10 }) },
  { id: 'quiz-100q', name: 'Quiz Whiz', jp: 'クイズ王', description: 'Answer 100 quiz questions', icon: '🧠', tier: 'gold', check: c => c.quizLog.reduce((a, q) => a + q.total, 0) >= 100, progress: c => ({ cur: c.quizLog.reduce((a, q) => a + q.total, 0), target: 100 }) },
  { id: 'cards-50', name: 'Card Deck', jp: '五十音の旅', description: 'Have 50 cards enrolled in SRS', icon: '🃏', tier: 'silver', check: c => Object.keys(c.cards).length >= 50, progress: c => ({ cur: Object.keys(c.cards).length, target: 50 }) },
  { id: 'cards-200', name: 'Grand Deck', jp: '大卡拉OK', description: 'Have 200 cards enrolled in SRS', icon: '🎴', tier: 'gold', check: c => Object.keys(c.cards).length >= 200, progress: c => ({ cur: Object.keys(c.cards).length, target: 200 }) },
  { id: 'mastered-20', name: 'Promoted', jp: '昇進', description: '20 cards in review state with 14+ day interval', icon: '🚀', tier: 'gold', check: c => Object.values(c.cards).filter(x => x.state === 'review' && x.interval >= 14).length >= 20, progress: c => ({ cur: Object.values(c.cards).filter(x => x.state === 'review' && x.interval >= 14).length, target: 20 }) },
];

export function evaluateAchievements(ctx: AchievementContext): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const a of ACHIEVEMENTS) out[a.id] = a.check(ctx);
  return out;
}
