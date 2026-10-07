import { createContext, useContext } from 'react';

/** Yêu cầu gửi sang chatbot AI từ bất kỳ nơi nào trong ứng dụng. */
export interface AskAIRequest {
  /** Nội dung đầy đủ gửi cho AI. */
  prompt: string;
  /** Dòng ngắn hiện trong khung chat thay cho prompt dài. */
  display: string;
}

export type AskAI = (request: AskAIRequest) => void;

// Mặc định không làm gì để component dùng hook này vẫn chạy được khi không có Provider.
export const AskAIContext = createContext<AskAI>(() => undefined);

export const useAskAI = (): AskAI => useContext(AskAIContext);
