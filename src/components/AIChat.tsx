import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { MarkdownText } from './MarkdownText';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Dòng ngắn hiện trong khung chat thay cho `content` dài (nội dung vẫn gửi đầy đủ cho AI). */
  display?: string;
};

const initialMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Chào bạn! Mình có thể giải thích bài học, gợi ý cách ôn tập hoặc trả lời câu hỏi về các môn học của bạn.',
};

export interface ChatContext {
  subjectName?: string;
  semesterTitle?: string;
}

// Số tin nhắn gần nhất gửi lên server (server cũng chỉ giữ tối đa 20) — tránh lỗi khi hội thoại dài.
const MAX_HISTORY_SENT = 12;

export interface AIChatRequest {
  id: number;
  prompt: string;
  display: string;
}

export function AIChat({ context, request }: { context?: ChatContext; request?: AIChatRequest | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Luôn trỏ tới danh sách tin nhắn mới nhất để gửi được cả khi được gọi từ bên ngoài (nút "Hỏi AI").
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  /** Gửi một tin nhắn. `display` (nếu có) là dòng ngắn hiện trong khung chat thay cho nội dung dài. */
  const post = async (content: string, display?: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content,
      display,
    };
    const nextMessages = [...messagesRef.current, userMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setError('');
    setIsSending(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-ai`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.id !== 'welcome')
            .slice(-MAX_HISTORY_SENT)
            .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          context,
        }),
      });

      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== 'object' || !('reply' in data) || typeof data.reply !== 'string') {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'Không thể kết nối với trợ lý AI.';
        throw new Error(message);
      }

      const reply = (data as { reply: string }).reply;
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: reply },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsSending(false);
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || isSending) return;
    setInput('');
    await post(content);
  };

  // Yêu cầu từ nơi khác (nút "Hỏi AI" ở câu trắc nghiệm): mở khung chat rồi tự gửi.
  // Nếu AI đang trả lời dở thì đợi xong mới gửi.
  const pendingRequest = useRef<AIChatRequest | null>(null);
  const lastRequestId = useRef<number | null>(null);
  useEffect(() => {
    if (request && request.id !== lastRequestId.current) {
      lastRequestId.current = request.id;
      pendingRequest.current = request;
      setIsOpen(true);
    }
  }, [request]);
  useEffect(() => {
    if (pendingRequest.current && !isSending) {
      const r = pendingRequest.current;
      pendingRequest.current = null;
      void post(r.prompt, r.display);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, isSending]);

  return (
    <>
      {isOpen && (
        <section className="fixed bottom-24 right-4 z-30 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-scale-in">
          <div className="flex items-center justify-between bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Trợ lý học tập AI</h2>
                <p className="text-[11px] text-primary-100">
                  {context?.subjectName ? `Đang xem: ${context.subjectName}` : 'Hỏi bất cứ điều gì về việc học'}
                </p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Đóng chat">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex h-80 flex-col sm:h-[28rem]">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-br-md bg-primary-600 text-white whitespace-pre-wrap' : 'rounded-bl-md bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-200'}`}>
                    {message.role === 'assistant' ? <MarkdownText text={message.content} /> : message.display ?? message.content}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang suy nghĩ...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && <p className="px-3 pb-2 text-xs text-rose-500">{error}</p>}
            <form onSubmit={sendMessage} className="flex gap-2 border-t border-gray-200 p-3 dark:border-slate-800">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Nhập câu hỏi của bạn..."
                aria-label="Nhập câu hỏi"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-950"
              />
              <button type="submit" disabled={!input.trim() || isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Gửi câu hỏi">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      )}

      <button onClick={() => setIsOpen((open) => !open)} className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition hover:-translate-y-0.5 hover:bg-primary-700" aria-label="Mở trợ lý học tập AI">
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="hidden sm:inline">Hỏi AI</span>
      </button>
    </>
  );
}
