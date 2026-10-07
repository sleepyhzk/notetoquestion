import type { ReactNode } from 'react';

// Trình render Markdown tối giản cho câu trả lời của AI.
// Không dùng dangerouslySetInnerHTML: mọi thứ được dựng thành phần tử React nên không có nguy cơ XSS.
// Hỗ trợ: khối code ```, `code`, **đậm**, *nghiêng*, tiêu đề #, danh sách - / 1., liên kết http(s).

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (match[1]) {
      nodes.push(
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        nodes.push(
          <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Khối code
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; // bỏ dòng ``` đóng
      blocks.push(
        <pre key={k++} className="my-2 overflow-x-auto rounded-lg bg-black/80 p-3 text-xs text-gray-100">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Danh sách
    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k++} className={`my-1.5 space-y-0.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `li-${k}-${idx}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }

    // Tiêu đề
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={k++} className="mt-2 mb-1 font-semibold">
          {renderInline(heading[1], `h-${k}`)}
        </p>,
      );
      i++;
      continue;
    }

    // Dòng trống
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Đoạn văn (gộp các dòng liên tiếp)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={k++} className="my-1 whitespace-pre-wrap">
        {renderInline(para.join('\n'), `p-${k}`)}
      </p>,
    );
  }

  return <div className="break-words">{blocks}</div>;
}
