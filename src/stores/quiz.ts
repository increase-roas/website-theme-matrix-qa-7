/**
 * Shared quiz state.
 *
 * A page can carry the quiz twice — once above the fold, once further down.
 * Without shared state, answering the top one and scrolling to the bottom one
 * shows a form that has forgotten the answer. Nano Stores keeps both
 * instances on the same step without prop drilling through Astro.
 */

import { map } from 'nanostores';

export interface QuizState {
  step: 1 | 2;
  /** Category SLUG, always one the client actually sells. */
  category: string;
  categoryLabel: string;
}

export const quizStore = map<QuizState>({
  step: 1,
  category: '',
  categoryLabel: '',
});

export function selectCategory(slug: string, label: string): void {
  quizStore.set({ step: 2, category: slug, categoryLabel: label });
}

export function resetQuiz(): void {
  quizStore.set({ step: 1, category: '', categoryLabel: '' });
}
