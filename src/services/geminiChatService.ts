import { FinancialContext, VoucherAction } from '../components/GeminiChatbot';

export interface ChatServiceMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

export interface ChatServiceResult {
  reply: string;
  actions: VoucherAction[];
}

/**
 * Send chat message to server-side Gemini assistant endpoint (/api/gemini/chat).
 * All Gemini model calls, function calling execution, financial context grounding,
 * and API keys remain safely on the server.
 */
export async function sendChatMessageDirectlyToGemini(
  messages: ChatServiceMessage[],
  context: FinancialContext | null
): Promise<ChatServiceResult> {
  if (!messages || messages.length === 0) {
    throw new Error('Không có tin nhắn nào để gửi.');
  }

  const response = await fetch('/api/gemini/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      context,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Lỗi từ máy chủ (${response.status})`;
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return {
    reply: data.reply || 'Tôi đã tiếp nhận và xử lý yêu cầu của bạn.',
    actions: data.actions || [],
  };
}
