// Chia các ghi chú đã chọn thành từng "phần" vừa đủ nhỏ để gửi cho AI.
// Mỗi phần được xử lý riêng và yêu cầu AI bao quát HẾT kiến thức trong phần đó, nên số câu hỏi
// tăng theo lượng ghi chú thay vì bị khoá ở một con số cố định.

export interface NoteLike {
  title: string;
  content: string;
}

export interface NoteChunk {
  /** Văn bản gửi cho AI (kèm tiêu đề ghi chú làm ngữ cảnh). */
  aiText: string;
  /** Chỉ nội dung thuần, dùng cho bộ tạo câu hỏi dự phòng trên máy. */
  localText: string;
  chars: number;
}

export const CHUNK_TARGET_CHARS = 4000; // kích thước mong muốn của một phần
export const CHUNK_MAX_PIECE = 7000; // một ghi chú dài hơn mức này sẽ bị cắt theo đoạn

interface Piece {
  title: string;
  text: string;
}

/** Cắt một văn bản dài thành các đoạn <= limit, ưu tiên cắt ở ranh giới đoạn văn / câu. */
function splitLong(text: string, limit: number): string[] {
  const out: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = '';
  };
  const paragraphs = text.split(/\n{2,}/);
  for (const para of paragraphs) {
    if (para.length > limit) {
      // đoạn khổng lồ: cắt theo câu, cuối cùng mới cắt cứng
      flush();
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (s.length > limit) {
          flush();
          for (let i = 0; i < s.length; i += limit) out.push(s.slice(i, i + limit));
        } else if ((current + ' ' + s).length > limit) {
          flush();
          current = s;
        } else {
          current = current ? `${current} ${s}` : s;
        }
      }
      flush();
    } else if ((current + '\n\n' + para).length > limit) {
      flush();
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  flush();
  return out;
}

export function chunkNotes(notes: NoteLike[]): NoteChunk[] {
  const pieces: Piece[] = [];
  for (const note of notes) {
    const content = note.content.trim();
    if (!content) continue;
    const title = note.title.trim() || 'Ghi chú không tiêu đề';
    if (content.length <= CHUNK_MAX_PIECE) {
      pieces.push({ title, text: content });
    } else {
      splitLong(content, CHUNK_TARGET_CHARS).forEach((text, i) =>
        pieces.push({ title: i === 0 ? title : `${title} (tiếp)`, text }),
      );
    }
  }

  const chunks: NoteChunk[] = [];
  let ai = '';
  let local = '';
  let chars = 0;
  const flush = () => {
    if (chars > 0) chunks.push({ aiText: ai.trim(), localText: local.trim(), chars });
    ai = '';
    local = '';
    chars = 0;
  };
  for (const piece of pieces) {
    if (chars > 0 && chars + piece.text.length > CHUNK_TARGET_CHARS) flush();
    ai += `## ${piece.title}\n${piece.text}\n\n`;
    local += `${piece.text}\n\n`;
    chars += piece.text.length;
  }
  flush();
  return chunks;
}

/** Số câu tối đa cho một phần: khoảng 1 câu / 180 ký tự, trong khoảng 5–30 (mỗi câu giờ kèm giải thích từng đáp án nên đầu ra dài hơn). */
export function questionCeiling(chars: number): number {
  return Math.min(30, Math.max(5, Math.ceil(chars / 180)));
}
