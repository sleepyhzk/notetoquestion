// Tiện ích tạo ID ổn định / duy nhất.

/** Hash chuỗi nhanh (FNV-1a 32 bit) -> chuỗi base36. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * ID của câu hỏi sinh ra từ NỘI DUNG câu hỏi + đáp án đúng.
 * - Cùng một câu hỏi => cùng ID (không bị lưu trùng vào "câu sai").
 * - Hai câu hỏi khác nhau => ID khác nhau (không bị đè lên nhau như `edge-q-0`).
 * Không phụ thuộc thứ tự đáp án để câu xáo trộn vẫn được nhận ra là một.
 */
export function questionId(prefix: string, question: string, options: string[], correctIndex: number): string {
  const correct = options[correctIndex] ?? '';
  const sortedOptions = [...options].sort().join('|');
  return `${prefix}-${hashString(`${question.trim()}##${correct}##${sortedOptions}`)}`;
}
