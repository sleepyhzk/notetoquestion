// Nhận diện ngôn ngữ (Việt / Anh) của câu hỏi để biết câu nào cần dịch khi người dùng đổi ngôn ngữ.

export type Lang = 'vi' | 'en';

// Các chữ cái có dấu đặc trưng của tiếng Việt (gần như không xuất hiện trong tiếng Anh).
const VI_ONLY = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/giu;

export function detectLang(text: string): Lang {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return 'en';
  const viChars = text.match(VI_ONLY)?.length ?? 0;
  // Tiếng Việt có khoảng 25–35% chữ cái mang dấu; tiếng Anh gần như 0%.
  return viChars >= 2 && viChars / letters > 0.04 ? 'vi' : 'en';
}

export function questionText(q: { question: string; options: string[] }): string {
  return `${q.question} ${q.options.join(' ')}`;
}

/** Ngôn ngữ chiếm đa số trong một bộ câu hỏi. */
export function dominantLang(questions: { question: string; options: string[] }[]): Lang {
  let vi = 0;
  let en = 0;
  for (const q of questions) {
    if (detectLang(questionText(q)) === 'vi') vi++;
    else en++;
  }
  return vi >= en ? 'vi' : 'en';
}
