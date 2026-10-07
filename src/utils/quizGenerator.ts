// Bộ tạo câu hỏi cục bộ (chạy ngay trên trình duyệt).
// Được dùng khi edge function / AI không khả dụng. Không phải bản sao của edge function:
// edge function chỉ gọi AI, phần dự phòng nằm duy nhất ở file này.

import { questionId } from './ids';

export interface GeneratedQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// ---------- Helpers ----------

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripPunct(w: string): string {
  return w.replace(/^[\s.,;:!?()"'“”‘’\[\]{}]+|[\s.,;:!?()"'“”‘’\[\]{}]+$/gu, '');
}

function uniqueCI(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'and', 'or', 'but', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'that', 'this', 'which', 'when', 'then', 'there', 'their', 'these', 'those',
  'có', 'là', 'và', 'hoặc', 'nhưng', 'trong', 'của', 'với', 'để', 'cho', 'không', 'các', 'một', 'được',
  'này', 'khi', 'nếu', 'thì', 'cũng', 'về', 'những', 'như', 'cần', 'phải', 'sẽ', 'đã', 'đang', 'từ',
  'theo', 'bởi', 'vì', 'nên', 'rằng', 'mà', 'hay', 'tại', 'trên', 'dưới', 'giữa', 'sau', 'trước',
]);

const PRONOUN_TERMS = new Set(['đây', 'đó', 'nó', 'này', 'kia', 'điều này', 'điều đó', 'ví dụ', 'lưu ý', 'chú ý', 'note', 'example', 'kết luận', 'tóm lại']);

// ---------- Trích xuất nội dung ----------

function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim())
    .filter((s) => s.length > 20 && s.length < 400);
}

function extractKeyTerms(text: string): { term: string; definition: string }[] {
  const found: { term: string; definition: string }[] = [];
  const lines = text.split(/\n+/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').trim());

  const isGoodTerm = (term: string) => {
    const words = term.split(/\s+/);
    return (
      term.length >= 2 &&
      term.length <= 60 &&
      words.length <= 6 &&
      !/[,;]/.test(term) &&
      !PRONOUN_TERMS.has(term.toLowerCase())
    );
  };

  for (const line of lines) {
    // "Thuật ngữ: định nghĩa"
    const colon = line.match(/^([^:.!?]{2,60}):\s+(.{10,250})$/u);
    if (colon && isGoodTerm(colon[1].trim())) {
      found.push({ term: colon[1].trim(), definition: colon[2].trim().replace(/[.!]+$/, '') });
      continue;
    }
    // "X là Y", "X được gọi là Y", "X is Y"...
    const is = line.match(
      /^(.{2,60}?)\s+(?:là|được gọi là|được định nghĩa là|được hiểu là|nghĩa là|is|are|means|refers to)\s+(.{10,250}?)[.!]?$/iu,
    );
    if (is && isGoodTerm(is[1].trim())) {
      found.push({ term: is[1].trim(), definition: is[2].trim() });
    }
  }

  // loại trùng theo thuật ngữ
  const seen = new Set<string>();
  return found
    .filter((d) => {
      const k = d.term.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 20);
}

// ---------- Từng dạng câu hỏi ----------

function makeFillInBlank(sentence: string): { question: string; answer: string } | null {
  const words = sentence.split(/\s+/);
  if (words.length < 6) return null;
  const candidates = words
    .map((w, i) => ({ word: stripPunct(w), index: i }))
    .filter(
      (w) =>
        w.word.length > 4 &&
        /^[\p{L}\p{N}_-]+$/u.test(w.word) && // bỏ từ chứa ký hiệu như O(n^2)
        !STOP_WORDS.has(w.word.toLowerCase()) &&
        !/^\d+$/.test(w.word),
    );
  if (candidates.length === 0) return null;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const masked = words.map((w, i) => (i === picked.index ? w.replace(picked.word, '_____') : w)).join(' ');
  return { question: masked, answer: picked.word };
}

/** Chọn đáp án nhiễu "giống" đáp án đúng (cùng kiểu viết hoa, độ dài gần) để không lộ đáp án. */
function pickSimilarWords(answer: string, pool: string[], sentence: string, count: number): string[] {
  const lowerSentence = sentence.toLowerCase();
  const isCap = /^\p{Lu}/u.test(answer);
  const candidates = uniqueCI(pool).filter(
    (w) =>
      w.toLowerCase() !== answer.toLowerCase() &&
      !STOP_WORDS.has(w.toLowerCase()) &&
      !lowerSentence.includes(w.toLowerCase()),
  );
  const scored = candidates
    .map((w) => ({
      w,
      score: Math.abs(w.length - answer.length) + (/^\p{Lu}/u.test(w) === isCap ? 0 : 3) + Math.random(),
    }))
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map((s) => s.w);
}

function makeTermQuestion(sentence: string, term: string): string | null {
  const re = new RegExp(escapeRegExp(term), 'iu');
  if (!re.test(sentence)) return null;
  const masked = sentence.replace(re, '_____');
  // nếu mask xong câu chỉ còn chỗ trống thì vô nghĩa
  return masked.replace(/[_\s.,;:!?"']/g, '').length < 10 ? null : masked;
}

/** Tạo phiên bản SAI có nghĩa của một câu. Trả null nếu không tạo được cách nào hợp lý. */
function makeFalseStatement(sentence: string, terms: string[]): string | null {
  // 1. Hoán đổi một thuật ngữ bằng thuật ngữ khác
  const present = terms.find((t) => new RegExp(escapeRegExp(t), 'iu').test(sentence));
  const others = terms.filter((t) => t.toLowerCase() !== present?.toLowerCase());
  if (present && others.length > 0) {
    const replacement = others[Math.floor(Math.random() * others.length)];
    return sentence.replace(new RegExp(escapeRegExp(present), 'iu'), replacement);
  }
  // 2. Đổi một con số
  const num = sentence.match(/\d+/);
  if (num) {
    const n = parseInt(num[0], 10);
    const changed = n === 0 ? 1 : n + (Math.random() > 0.5 ? 1 : -1) * (Math.ceil(Math.random() * 3));
    return sentence.replace(num[0], String(Math.max(0, changed === n ? n + 1 : changed)));
  }
  // 3. Phủ định động từ chính
  const negations: [RegExp, string][] = [
    [/\bkhông phải là\b/iu, 'là'],
    [/\bkhông thể\b/iu, 'có thể'],
    [/\bcó thể\b/iu, 'không thể'],
    [/\bđược gọi là\b/iu, 'không được gọi là'],
    [/\bphải\b/iu, 'không cần'],
    [/\bis not\b/i, 'is'],
    [/\bcannot\b/i, 'can'],
    [/\bcan\b/i, 'cannot'],
    [/\bis\b/i, 'is not'],
    [/\bare\b/i, 'are not'],
    [/\blà\b/iu, 'không phải là'],
    [/\bcó\b/iu, 'không có'],
  ];
  for (const [re, rep] of negations) {
    if (re.test(sentence)) return sentence.replace(re, rep);
  }
  return null;
}

// ---------- Hàm chính ----------

export function generateQuizFromNotes(
  notesContent: string,
  _subjectName: string = '',
  maxQuestions: number = 80,
): GeneratedQuestion[] {
  const sentences = extractSentences(notesContent);
  const definitions = extractKeyTerms(notesContent);
  const allTerms = uniqueCI(definitions.map((d) => d.term));

  const wordPool = uniqueCI(
    sentences
      .flatMap((s) => s.split(/\s+/))
      .map(stripPunct)
      .filter((w) => w.length > 4 && /^[\p{L}\p{N}_-]+$/u.test(w) && !/^\d+$/.test(w)),
  );

  const questions: GeneratedQuestion[] = [];
  const usedIds = new Set<string>();
  const usedSentences = new Set<string>(); // mỗi câu trong ghi chú chỉ ra đề tối đa 1 lần ở các dạng 2-4

  const push = (topic: string, question: string, options: string[], correctIndex: number, explanation: string) => {
    if (correctIndex < 0 || options.length < 2) return;
    if (uniqueCI(options).length !== options.length) return; // đáp án trùng nhau
    const id = questionId('gen', question, options, correctIndex);
    if (usedIds.has(id)) return;
    usedIds.add(id);
    questions.push({ id, topic, question, options, correctIndex, explanation });
  };

  // 1. Định nghĩa -> chọn thuật ngữ
  for (const def of shuffleArray(definitions)) {
    const distractors = shuffleArray(allTerms.filter((t) => t.toLowerCase() !== def.term.toLowerCase())).slice(0, 3);
    if (distractors.length < 3) continue;
    const options = shuffleArray([def.term, ...distractors]);
    push(
      'Khái niệm',
      `Khái niệm nào được mô tả sau đây: "${def.definition}"?`,
      options,
      options.indexOf(def.term),
      `"${def.term}" được định nghĩa là: ${def.definition}`,
    );
  }

  // 2. Câu chứa thuật ngữ -> điền thuật ngữ
  if (allTerms.length >= 4) {
    for (const sentence of shuffleArray(sentences)) {
      if (usedSentences.has(sentence)) continue;
      const term = allTerms.find((t) => new RegExp(escapeRegExp(t), 'iu').test(sentence));
      if (!term) continue;
      const masked = makeTermQuestion(sentence, term);
      if (!masked) continue;
      const distractors = shuffleArray(allTerms.filter((t) => t.toLowerCase() !== term.toLowerCase())).slice(0, 3);
      if (distractors.length < 3) continue;
      const options = shuffleArray([term, ...distractors]);
      usedSentences.add(sentence);
      push(
        'Nhận diện khái niệm',
        `Điền thuật ngữ còn thiếu: "${masked}"`,
        options,
        options.indexOf(term),
        `Thuật ngữ đúng là "${term}". Câu đầy đủ: ${sentence}`,
      );
    }
  }

  // 3. Điền từ
  for (const sentence of shuffleArray(sentences)) {
    if (usedSentences.has(sentence)) continue;
    const fib = makeFillInBlank(sentence);
    if (!fib) continue;
    const distractors = pickSimilarWords(fib.answer, wordPool, sentence, 3);
    if (distractors.length < 3) continue;
    usedSentences.add(sentence);
    const options = shuffleArray([fib.answer, ...distractors]);
    push(
      'Điền từ',
      `Điền từ còn thiếu vào chỗ trống: "${fib.question}"`,
      options,
      options.indexOf(fib.answer),
      `Từ đúng là "${fib.answer}". Câu đầy đủ: ${sentence}`,
    );
  }

  // 4. Đúng / Sai (chỉ 2 lựa chọn; bỏ qua câu không tạo được phiên bản sai hợp lý)
  for (const sentence of shuffleArray(sentences)) {
    if (usedSentences.has(sentence)) continue;
    const wantTrue = Math.random() > 0.5;
    let shown = sentence;
    if (!wantTrue) {
      const falseVersion = makeFalseStatement(sentence, allTerms);
      if (!falseVersion || falseVersion === sentence) continue;
      shown = falseVersion;
    }
    usedSentences.add(sentence);
    push(
      'Đúng/Sai',
      `Câu sau đây đúng hay sai? "${shown}"`,
      ['Đúng', 'Sai'],
      wantTrue ? 0 : 1,
      wantTrue
        ? 'Câu này đúng, được trích từ ghi chú của bạn.'
        : `Câu này sai. Câu đúng trong ghi chú là: "${sentence}"`,
    );
  }

  // Trộn đều các dạng câu hỏi (round-robin) để bộ đề không bị lệch về một dạng.
  const byTopic = new Map<string, GeneratedQuestion[]>();
  for (const q of shuffleArray(questions)) {
    byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
  }
  const groups = shuffleArray([...byTopic.values()]);
  const mixed: GeneratedQuestion[] = [];
  while (mixed.length < maxQuestions && groups.some((g) => g.length > 0)) {
    for (const g of groups) {
      const next = g.shift();
      if (next && mixed.length < maxQuestions) mixed.push(next);
    }
  }
  return shuffleArray(mixed);
}
