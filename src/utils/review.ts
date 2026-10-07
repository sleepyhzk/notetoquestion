// Quy tắc của danh sách "Cần ôn tập". Một câu nằm trong danh sách khi:
//   - còn là câu SAI (làm sai và chưa làm đúng lại), hoặc
//   - được người dùng GẮN SAO.
// Làm đúng: câu sai bị bỏ khỏi danh sách, NHƯNG câu có gắn sao thì ở lại.
// Bỏ sao: câu rời danh sách nếu nó không còn là câu sai.

import type { QuizQuestion, WrongAnswer } from '../types';

export const isWrong = (w: WrongAnswer): boolean => w.wrong !== false;
export const isStarred = (w: WrongAnswer): boolean => w.starred === true;

/** Bản chụp nội dung câu hỏi, đủ để làm lại câu đó ở tab Ôn tập. */
export interface QuestionSnapshot {
  questionId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
  optionExplanations?: string[];
}

export function snapshotOf(q: QuizQuestion): QuestionSnapshot {
  return {
    questionId: q.id,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    topic: q.topic,
    optionExplanations: q.optionExplanations,
  };
}

export function snapshotOfItem(w: WrongAnswer): QuestionSnapshot {
  return {
    questionId: w.questionId,
    question: w.question,
    options: w.options,
    correctIndex: w.correctIndex,
    explanation: w.explanation,
    topic: w.topic,
    optionExplanations: w.optionExplanations,
  };
}

/** Ghi nhận các câu vừa làm SAI. Câu đã có trong danh sách (kể cả câu chỉ gắn sao) trở lại là câu sai, tăng số lần sai. */
export function markWrong(list: WrongAnswer[], wrongs: WrongAnswer[]): WrongAnswer[] {
  if (wrongs.length === 0) return list;
  const incoming = new Map(wrongs.map((w) => [w.questionId, w]));
  const updated = list.map((w) => {
    const again = incoming.get(w.questionId);
    return again ? { ...w, selectedIndex: again.selectedIndex, attempts: (w.attempts ?? 0) + 1, wrong: true } : w;
  });
  const have = new Set(list.map((w) => w.questionId));
  const added = wrongs.filter((w) => !have.has(w.questionId)).map((w) => ({ ...w, wrong: true }));
  return [...added, ...updated];
}

/** Ghi nhận các câu vừa làm ĐÚNG: câu sai bị bỏ; câu có gắn sao ở lại (nhưng không còn tính là câu sai). */
export function resolveCorrect(list: WrongAnswer[], ids: string[]): WrongAnswer[] {
  if (ids.length === 0) return list;
  const set = new Set(ids);
  const out: WrongAnswer[] = [];
  for (const w of list) {
    if (!set.has(w.questionId)) out.push(w);
    else if (isStarred(w)) out.push({ ...w, wrong: false });
    // còn lại: bỏ khỏi danh sách
  }
  return out;
}

/** Gắn / bỏ sao. Gắn sao một câu chưa có trong danh sách sẽ thêm nó vào. */
export function setStar(list: WrongAnswer[], snap: QuestionSnapshot, starred: boolean, now: number = Date.now()): WrongAnswer[] {
  const existing = list.find((w) => w.questionId === snap.questionId);
  if (starred) {
    if (existing) return list.map((w) => (w.questionId === snap.questionId ? { ...w, starred: true } : w));
    const item: WrongAnswer = { ...snap, selectedIndex: -1, addedAt: now, attempts: 0, wrong: false, starred: true };
    return [item, ...list];
  }
  if (!existing) return list;
  // bỏ sao: còn sai thì ở lại, không thì rời danh sách
  return isWrong(existing)
    ? list.map((w) => (w.questionId === snap.questionId ? { ...w, starred: false } : w))
    : list.filter((w) => w.questionId !== snap.questionId);
}

/** Xoá hẳn một câu khỏi danh sách (cả sao lẫn câu sai). */
export function removeOne(list: WrongAnswer[], id: string): WrongAnswer[] {
  return list.filter((w) => w.questionId !== id);
}

/** "Xoá câu sai": bỏ mọi câu sai; câu có gắn sao vẫn giữ. */
export function clearWrong(list: WrongAnswer[]): WrongAnswer[] {
  return list.filter(isStarred).map((w) => ({ ...w, wrong: false }));
}

export function countReview(list: WrongAnswer[]) {
  return { total: list.length, wrong: list.filter(isWrong).length, starred: list.filter(isStarred).length };
}
