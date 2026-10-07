// Soạn nội dung gửi cho chatbot AI khi người dùng muốn tìm hiểu thêm về một câu hỏi trắc nghiệm.
// - Đã trả lời: gửi kèm đáp án đúng, lựa chọn của người dùng và giải thích để AI giải thích sâu.
// - Chưa trả lời: KHÔNG gửi đáp án đúng, chỉ nhờ AI gợi ý kiến thức nền để người dùng tự làm.

import type { AskAIRequest } from '../context/AskAI';

export interface QuestionForAI {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

const letter = (i: number) => String.fromCharCode(65 + i);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Máy chủ chặn tin nhắn dài quá 4000 ký tự, nên giữ prompt dưới mức đó.
const PROMPT_MAX = 3900;

export function buildQuestionPrompt(
  q: QuestionForAI,
  opts: { answered: boolean; selectedIndex: number | null },
): AskAIRequest {
  const question = clip(q.question.trim(), 1200);
  const options = q.options.map((o, i) => `${letter(i)}. ${clip(o.trim(), 300)}`).join('\n');
  const parts: string[] = [];

  if (opts.answered) {
    parts.push('Mình đang làm bài trắc nghiệm và muốn tìm hiểu kỹ hơn câu này, nhờ bạn giải thích giúp.');
    parts.push(`Câu hỏi: ${question}\n${options}`);
    parts.push(`Đáp án đúng: ${letter(q.correctIndex)}. ${clip(q.options[q.correctIndex]?.trim() ?? '', 300)}`);
    if (opts.selectedIndex !== null && opts.selectedIndex >= 0 && opts.selectedIndex < q.options.length) {
      parts.push(
        opts.selectedIndex === q.correctIndex
          ? 'Mình đã chọn đúng.'
          : `Mình đã chọn: ${letter(opts.selectedIndex)}. ${clip(q.options[opts.selectedIndex].trim(), 300)} (sai).`,
      );
    }
    if (q.explanation?.trim()) parts.push(`Giải thích có sẵn trong ghi chú của mình: ${clip(q.explanation.trim(), 800)}`);
    parts.push(
      'Hãy giải thích vì sao đáp án đúng là đúng và vì sao từng đáp án còn lại sai ' +
        '(nếu mình chọn sai, chỉ ra chỗ mình dễ nhầm). Sau đó cho một ví dụ thực tế hoặc mẹo nhớ ngắn gọn.',
    );
  } else {
    parts.push('Mình đang làm bài trắc nghiệm và chưa trả lời câu này. Mình muốn hiểu kiến thức liên quan trước khi chọn.');
    parts.push(`Câu hỏi: ${question}\n${options}`);
    parts.push(
      'Quan trọng: ĐỪNG nói cho mình biết đáp án đúng. Hãy giải thích các khái niệm nền tảng cần biết, ' +
        'nêu điểm khác nhau giữa các lựa chọn và gợi ý cách suy luận để mình tự chọn.',
    );
  }

  const label = opts.answered ? '' : ' (gợi ý, chưa tiết lộ đáp án)';
  return {
    prompt: parts.join('\n\n').slice(0, PROMPT_MAX),
    display: `Hỏi AI về câu: “${clip(q.question.trim().replace(/\s+/g, ' '), 110)}”${label}`,
  };
}
