import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Bot,
  User,
  Loader2,
  ChevronDown,
  Maximize2,
  Minimize2,
  ArrowDownToLine,
  ArrowUpRight,
  PiggyBank,
  Check,
  CreditCard,
  SlidersHorizontal,
  BookmarkCheck,
  Trash2,
} from 'lucide-react';
import { sendChatMessageDirectlyToGemini } from '../services/geminiChatService';

export interface VoucherAction {
  type: 'create_income' | 'create_expense' | 'create_savings' | 'update_proportions' | 'update_fixed_preset';
  presetType?: 'inflow' | 'outflow' | 'savings';
  title?: string;
  amount?: number;
  category?: 'needs_50' | 'wants_30' | 'savings_debt_20';
  subCategory?: string;
  targetWallet?: string;
  sourceWallet?: string;
  fromWallet?: string;
  toWallet?: string;
  debtTarget?: string;
  debtAction?: 'spend' | 'pay';
  isDebt?: boolean;
  date?: string;
  note?: string;
  segments?: Array<{ name: string; percentage: number }>;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp?: string;
  actions?: VoucherAction[];
}

export interface FinancialContext {
  activeSheetId?: string;
  todayDate?: string;
  currentMonthName?: string;
  monthlySalary?: number;
  totalIncome?: number;
  totalSpent?: number;
  remainingBalance?: number;
  remainingUsableMoney?: number;
  currentSavingsBalance?: number;
  totalActualMoneyRemaining?: number;
  currentNetWorth?: number;
  vouchersCount?: number;
  proportions?: Array<{ name: string; percentage: number }>;
  wallets?: Array<{ key: string; name: string }>;
  debts?: Array<{ key: string; name: string }>;
  totalRemainingDebts?: number;
  remainingDebtBreakdown?: Record<string, number>;
  fixedPresets?: Array<{
    id: string;
    type: 'inflow' | 'outflow' | 'savings';
    title: string;
    amount: number;
    targetWallet?: string;
    category?: string;
    subCategory?: string;
    fromWallet?: string;
    toWallet?: string;
  }>;
}

interface GeminiChatbotProps {
  context?: FinancialContext;
  formatVND?: (value: number | string) => string;
  onExecuteActions?: (actions: VoucherAction[]) => string[];
}

const QUICK_PROMPTS = [
  'Nay tôi vừa mới nhận lương',
  'Thanh toán nợ thẻ tín dụng',
  'Tình hình tài chính tháng này',
  'Gợi ý phân bổ 50/30/20',
];

const INITIAL_MESSAGE: ChatMessage = {
  id: 'msg-welcome',
  role: 'model',
  content: 'Xin chào! 👋 Tôi là **Trợ lý AI Gemini** của **MKS Wallet**. Tôi có thể giúp gì bạn?',
};

const SESSION_CHAT_KEY = 'mks_wallet_gemini_chat_session';
const FAB_POS_STORAGE_KEY = 'mks_wallet_chatbot_fab_pos';

export const GeminiChatbot: React.FC<GeminiChatbotProps> = ({ context, formatVND, onExecuteActions }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Draggable FAB position state: snaps to left or right edge with current margins
  const [fabSide, setFabSide] = useState<'left' | 'right'>(() => {
    if (typeof window === 'undefined') return 'right';
    try {
      const saved = localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.side === 'left' || parsed?.side === 'right') {
          return parsed.side;
        }
      }
    } catch {
      // ignore
    }
    return 'right';
  });

  // Helper to compute viewport margins and button dimensions
  const getFabMetrics = () => {
    const isClient = typeof window !== 'undefined';
    // Use document.documentElement.clientWidth to exclude the vertical scrollbar width
    const width = isClient
      ? (document.documentElement.clientWidth || window.innerWidth || 1200)
      : 1200;
    const height = isClient
      ? (window.innerHeight || document.documentElement.clientHeight || 800)
      : 800;
    const isMobile = width < 640;
    const btnSize = isMobile ? 52 : 56;
    const margin = isMobile ? 16 : 24;
    const bottomSafe = isMobile ? 80 : 24;
    const topSafe = isMobile ? 16 : 24;
    const maxY = Math.max(topSafe, height - bottomSafe - btnSize);
    return { width, height, isMobile, btnSize, margin, bottomSafe, topSafe, maxY };
  };

  const [fabX, setFabX] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const width = document.documentElement.clientWidth || window.innerWidth || 1200;
    const isMobile = width < 640;
    const btnSize = isMobile ? 52 : 56;
    const margin = isMobile ? 16 : 24;

    let side: 'left' | 'right' = 'right';
    try {
      const saved = localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.side === 'left' || parsed?.side === 'right') {
          side = parsed.side;
        }
      }
    } catch {
      // ignore
    }
    return side === 'left' ? margin : width - margin - btnSize;
  });

  const [fabY, setFabY] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const width = document.documentElement.clientWidth || window.innerWidth || 1200;
    const height = window.innerHeight || document.documentElement.clientHeight || 800;
    const isMobile = width < 640;
    const btnSize = isMobile ? 52 : 56;
    const bottomSafe = isMobile ? 80 : 24;
    const topSafe = isMobile ? 16 : 24;
    const maxY = Math.max(topSafe, height - bottomSafe - btnSize);
    let initialY = Math.max(topSafe, height - bottomSafe - btnSize);

    try {
      const saved = localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.yRatio === 'number') {
          return Math.max(topSafe, Math.min(maxY, Math.round(parsed.yRatio * height)));
        } else if (typeof parsed?.y === 'number') {
          return Math.max(topSafe, Math.min(maxY, parsed.y));
        }
      }
    } catch {
      // ignore
    }
    return initialY;
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);

  // Restore saved FAB position or calculate initial default on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { width, height, btnSize, margin, bottomSafe, topSafe, maxY } = getFabMetrics();

    let initialSide: 'left' | 'right' = 'right';
    let initialY = Math.max(topSafe, height - bottomSafe - btnSize);

    try {
      const saved = localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.side === 'left' || parsed.side === 'right')) {
          initialSide = parsed.side;
        }
        if (typeof parsed?.yRatio === 'number') {
          initialY = Math.max(topSafe, Math.min(maxY, Math.round(parsed.yRatio * height)));
        } else if (typeof parsed?.y === 'number') {
          initialY = Math.max(topSafe, Math.min(maxY, parsed.y));
        }
      }
    } catch {
      // ignore
    }

    const initialX = initialSide === 'left' ? margin : width - margin - btnSize;
    setFabSide(initialSide);
    setFabX(initialX);
    setFabY(initialY);
  }, []);

  // Window resize handler: Keep FAB docked to edge and clamped inside viewport
  useEffect(() => {
    const handleResize = () => {
      const { width, btnSize, margin, topSafe, maxY } = getFabMetrics();
      setFabX(fabSide === 'left' ? margin : width - margin - btnSize);
      setFabY((prevY) => (prevY !== null ? Math.max(topSafe, Math.min(maxY, prevY)) : null));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fabSide]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const { width, height, btnSize, margin, bottomSafe, topSafe } = getFabMetrics();
    const currentX = fabX ?? (fabSide === 'left' ? margin : width - margin - btnSize);
    const currentY = fabY ?? Math.max(topSafe, height - bottomSafe - btnSize);

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: currentX,
      startY: currentY,
    };
    hasDraggedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    if (!hasDraggedRef.current) {
      if (Math.hypot(dx, dy) > 4) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }
    }

    if (hasDraggedRef.current) {
      const { width, height, btnSize } = getFabMetrics();
      // Allow free smooth dragging within safe viewport boundaries
      const nextX = Math.max(4, Math.min(width - btnSize - 4, dragStartRef.current.startX + dx));
      const nextY = Math.max(4, Math.min(height - btnSize - 4, dragStartRef.current.startY + dy));
      setFabX(nextX);
      setFabY(nextY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const hasDragged = hasDraggedRef.current;
    dragStartRef.current = null;
    setIsDragging(false);

    if (hasDragged) {
      const { width, height, btnSize, margin, topSafe, maxY } = getFabMetrics();
      const currentX = fabX ?? e.clientX;
      const currentY = fabY ?? e.clientY;
      const centerX = currentX + btnSize / 2;

      // Ultra-smooth glide: Snap to nearest edge (left or right)
      const newSide: 'left' | 'right' = centerX < width / 2 ? 'left' : 'right';
      const targetX = newSide === 'left' ? margin : width - margin - btnSize;
      const targetY = Math.max(topSafe, Math.min(maxY, currentY));

      setFabSide(newSide);
      setFabX(targetX);
      setFabY(targetY);

      try {
        localStorage.setItem(
          FAB_POS_STORAGE_KEY,
          JSON.stringify({
            side: newSide,
            yRatio: targetY / height,
            y: targetY,
          })
        );
      } catch {
        // ignore
      }
    } else {
      // Direct click / tap without dragging: toggle chat window
      setIsOpen((prev) => !prev);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (dragStartRef.current && hasDraggedRef.current) {
      const { width, btnSize, margin, topSafe, maxY } = getFabMetrics();
      const currentX = fabX ?? 0;
      const currentY = fabY ?? 0;
      const centerX = currentX + btnSize / 2;
      const newSide: 'left' | 'right' = centerX < width / 2 ? 'left' : 'right';
      const targetX = newSide === 'left' ? margin : width - margin - btnSize;
      const targetY = Math.max(topSafe, Math.min(maxY, currentY));
      setFabSide(newSide);
      setFabX(targetX);
      setFabY(targetY);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  };
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      // Clear legacy persistent localStorage chat histories
      localStorage.removeItem('mks_wallet_gemini_chat_history_v1');
      localStorage.removeItem('mks_wallet_gemini_chat_history_v2');
      localStorage.removeItem('mks_wallet_gemini_chat_history_v3');
      localStorage.removeItem('mks_wallet_gemini_chat_history_v4');
      localStorage.removeItem('mks_wallet_gemini_chat_history_v5');

      // Only preserve conversation within this single active browser session
      const saved = sessionStorage.getItem(SESSION_CHAT_KEY);
      if (saved) {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed[0]?.id === 'msg-welcome') {
            parsed[0].content = INITIAL_MESSAGE.content;
          }
          // Remove 5th message (index 4) if present as requested by user
          if (parsed.length >= 5) {
            parsed.splice(4, 1);
            try {
              sessionStorage.setItem(SESSION_CHAT_KEY, JSON.stringify(parsed));
            } catch {
              // Ignore
            }
          }
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return [INITIAL_MESSAGE];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Save conversation history only for the active session (auto-resets when session ends)
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_CHAT_KEY, JSON.stringify(messages));
    } catch {
      // Ignore
    }
  }, [messages]);

  // Scroll to bottom when messages change or window opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      // Focus input when opened on desktop
      if (window.innerWidth >= 640) {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [isOpen, messages, isLoading]);

  const isSendingRef = useRef<boolean>(false);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : inputMessage).trim();
    if (!textToSend || isLoading || isSendingRef.current) return;

    isSendingRef.current = true;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      const chatMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const data = await sendChatMessageDirectlyToGemini(chatMessages, context || null);

      // Execute actual voucher creations in application state
      if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
        if (onExecuteActions) {
          onExecuteActions(data.actions);
        }
      }

      const modelMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'model',
        content: data.reply || 'Xin lỗi, tôi không thể tạo câu trả lời.',
        actions: data.actions && data.actions.length > 0 ? data.actions : undefined,
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'model',
        content: `⚠️ Có lỗi xảy ra: ${err.message || 'Không thể hoàn thành yêu cầu.'}. Vui lòng thử lại sau.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  const handleClearHistory = () => {
    setMessages([INITIAL_MESSAGE]);
    try {
      sessionStorage.removeItem(SESSION_CHAT_KEY);
      localStorage.removeItem('mks_wallet_gemini_chat_history_v5');
    } catch {
      // Ignore
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    setMessages((prev) => {
      const updated = prev.filter((m) => m.id !== msgId);
      try {
        sessionStorage.setItem(SESSION_CHAT_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSendingRef.current && !isLoading) {
        handleSendMessage();
      }
    }
  };

  // Helper to render simple markdown formatted text (bold, list, paragraphs)
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) {
            return <div key={idx} className="h-1" />;
          }

          // Bullet points
          const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
          const lineContent = isBullet ? line.trim().slice(2) : line;

          // Parse **bold** markers
          const parts = lineContent.split(/(\*\*.*?\*\*)/g);

          const formattedContent = parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong
                  key={pIdx}
                  className="font-semibold text-teal-600 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/70 border border-teal-200/60 dark:border-teal-700/60 px-1.5 py-0.5 rounded-md inline-block shadow-2xs"
                >
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          });

          if (isBullet) {
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-1">
                <span className="text-teal-500 font-bold shrink-0">•</span>
                <span>{formattedContent}</span>
              </div>
            );
          }

          return <p key={idx}>{formattedContent}</p>;
        })}
      </div>
    );
  };

  return (
    <>
      {/* 1. Floating Round Trigger Button (Draggable & Edge-Snapping) */}
      <div
        className="fixed top-0 left-0 z-40 select-none touch-none"
        style={{
          transform:
            fabX !== null && fabY !== null
              ? `translate3d(${fabX}px, ${fabY}px, 0)`
              : fabSide === 'left'
              ? 'translate3d(24px, calc(100vh - 140px), 0)'
              : 'translate3d(calc(100vw - 88px), calc(100vh - 140px), 0)',
          transition: isDragging
            ? 'none'
            : 'transform 0.48s cubic-bezier(0.19, 1, 0.22, 1)',
          willChange: 'transform',
        }}
      >
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          title={isOpen ? 'Đóng Trợ lý Gemini AI' : 'Mở Trợ lý Gemini AI (Kéo thả để di chuyển)'}
          aria-label="Mở Trợ lý Gemini AI"
          className={`relative group w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-teal-500 via-indigo-600 to-violet-600 hover:from-teal-400 hover:to-violet-500 text-white shadow-xl hover:shadow-2xl flex items-center justify-center ring-4 ring-white/20 dark:ring-slate-900/40 select-none transition-all duration-300 ease-out ${
            isDragging
              ? 'cursor-grabbing scale-110 shadow-2xl ring-indigo-400/60 ring-6'
              : 'cursor-grab active:cursor-grabbing hover:scale-105 active:scale-95'
          }`}
        >
          {isOpen ? (
            <X className="w-6 h-6 transition-transform duration-200 group-hover:rotate-90 pointer-events-none" />
          ) : (
            <>
              <Sparkles className="w-6 h-6 animate-pulse pointer-events-none" />
              {/* Subtle pulsing badge */}
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 pointer-events-none">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900" />
              </span>
            </>
          )}

          {/* Hover Tooltip Label */}
          {!isOpen && !isDragging && (
            <span
              className={`absolute top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 hidden sm:block ${
                fabSide === 'left' ? 'left-full ml-3' : 'right-full mr-3'
              }`}
            >
              Gemini AI Chatbot (Kéo để dời vị trí)
            </span>
          )}
        </button>
      </div>

      {/* 2. Small Chat Popup Window */}
      {isOpen && (
        <div
          className={`fixed z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-200 animate-in fade-in zoom-in-95 ${
            isExpanded
              ? `bottom-20 left-3 right-3 sm:bottom-6 sm:w-[520px] h-[85vh] max-h-[750px] ${
                  fabSide === 'left' ? 'sm:left-6 sm:right-auto' : 'sm:right-6 sm:left-auto'
                }`
              : `bottom-20 left-3 right-3 sm:bottom-22 sm:w-[390px] h-[520px] max-h-[calc(100vh-110px)] ${
                  fabSide === 'left' ? 'sm:left-6 sm:right-auto' : 'sm:right-6 sm:left-auto'
                }`
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-teal-600 via-indigo-600 to-violet-700 text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/30">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold truncate">Gemini Assistant</h3>
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/30 border border-emerald-400/40 px-1.5 py-0.5 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Trực tuyến
                  </span>
                </div>
                <p className="text-[11px] text-teal-100 truncate">
                  Trợ lý tài chính AI · MKS Wallet
                </p>
              </div>
            </div>

            {/* Header action buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearHistory}
                title="Làm mới đoạn hội thoại"
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? 'Thu nhỏ' : 'Mở rộng'}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer hidden sm:block"
              >
                {isExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Đóng cửa sổ chat"
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 items-end group ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 shadow-xs">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                      isUser
                        ? 'bg-gradient-to-r from-teal-600 to-indigo-600 text-white rounded-br-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/60 rounded-bl-xs'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>
                    ) : (
                      renderFormattedText(msg.content)
                    )}

                    {/* Render action result cards if voucher actions were executed */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2.5 space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        {msg.actions.map((act, aIdx) => {
                          const isFixedPreset = act.type === 'update_fixed_preset';
                          const isProportions = act.type === 'update_proportions';
                          const isDebtRepay = !isProportions && !isFixedPreset && Boolean(
                            act.debtAction === 'pay' ||
                            /thanh toán nợ|trả nợ|tất toán/i.test(`${act.title || ''} ${act.note || ''}`)
                          );
                          const isDebtSpend = !isProportions && !isFixedPreset && !isDebtRepay && Boolean(
                            act.debtAction === 'spend' ||
                            act.debtTarget ||
                            act.isDebt ||
                            /trừ vào nợ|trừ nợ|thẻ tín dụng|tín dụng|paylater|ghi nợ/i.test(`${act.title || ''} ${act.note || ''}`)
                          );
                          const debtLabel =
                            act.debtTarget === 'shopeePayLater' || /paylater|shopee/i.test(`${act.title || ''} ${act.note || ''}`)
                              ? 'PayLater'
                              : 'Thẻ tín dụng';

                          return (
                            <div
                              key={aIdx}
                              className={`p-2 rounded-xl flex items-center justify-between gap-2 text-xs border ${
                                isFixedPreset
                                  ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 text-teal-900 dark:text-teal-200'
                                  : isProportions
                                  ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 text-teal-900 dark:text-teal-200'
                                  : act.type === 'create_income'
                                  ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60 text-teal-900 dark:text-teal-200'
                                  : isDebtRepay
                                  ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                                  : isDebtSpend
                                  ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                                  : act.type === 'create_expense'
                                  ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                                  : 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                    isFixedPreset
                                      ? 'bg-teal-600 text-white'
                                      : isProportions
                                      ? 'bg-teal-500 text-white'
                                      : act.type === 'create_income'
                                      ? 'bg-teal-500 text-white'
                                      : isDebtRepay
                                      ? 'bg-emerald-500 text-white'
                                      : isDebtSpend
                                      ? 'bg-amber-500 text-white'
                                      : act.type === 'create_expense'
                                      ? 'bg-rose-500 text-white'
                                      : 'bg-indigo-500 text-white'
                                  }`}
                                >
                                  {isFixedPreset ? (
                                    <BookmarkCheck className="w-3.5 h-3.5" />
                                  ) : isProportions ? (
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                  ) : act.type === 'create_income' ? (
                                    <ArrowDownToLine className="w-3.5 h-3.5" />
                                  ) : isDebtRepay ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : isDebtSpend ? (
                                    <CreditCard className="w-3.5 h-3.5" />
                                  ) : act.type === 'create_expense' ? (
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <PiggyBank className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-semibold opacity-75 uppercase tracking-wider">
                                    {isFixedPreset
                                      ? 'Đã cập nhật Dòng tiền cố định'
                                      : isProportions
                                      ? 'Đã cập nhật Bảng điều chỉnh tỷ lệ'
                                      : act.type === 'create_income'
                                      ? 'Đã tạo Phiếu Thu (Tiền vào)'
                                      : isDebtRepay
                                      ? `Đã thanh toán nợ (${debtLabel} · Giảm dư nợ)`
                                      : isDebtSpend
                                      ? `Ghi nợ (${debtLabel} · Không trừ tiền mặt)`
                                      : act.type === 'create_expense'
                                      ? 'Đã tạo Phiếu Chi (Tiền ra)'
                                      : 'Đã tạo Phiếu Tiết Kiệm'}
                                  </div>
                                  <div className="font-bold truncate text-slate-900 dark:text-white">
                                    {isFixedPreset
                                      ? `${act.title || 'Dòng tiền cố định'} (${
                                          act.presetType === 'outflow'
                                            ? 'Chi tiêu cố định'
                                            : act.presetType === 'savings'
                                            ? 'Tiết kiệm cố định'
                                            : 'Thu nhập cố định'
                                        })`
                                      : isProportions
                                      ? (act.segments?.map((s) => `${s.name}: ${s.percentage}%`).join(' · ') || act.reason || 'Điều chỉnh tỷ lệ phân bổ')
                                      : `${act.title || ''}${act.subCategory ? ` · ${act.subCategory}` : ''}`}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span
                                  className={`font-mono font-bold text-xs ${
                                    isFixedPreset
                                      ? 'text-teal-600 dark:text-teal-400'
                                      : isProportions
                                      ? 'text-teal-600 dark:text-teal-400'
                                      : act.type === 'create_income'
                                      ? 'text-teal-600 dark:text-teal-400'
                                      : isDebtRepay
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : isDebtSpend
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : act.type === 'create_expense'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-indigo-600 dark:text-indigo-400'
                                  }`}
                                >
                                  {isFixedPreset
                                    ? `${formatVND ? formatVND(act.amount || 0) : act.amount}/kỳ`
                                    : isProportions
                                    ? '100%'
                                    : act.type === 'create_income'
                                    ? `+${formatVND ? formatVND(act.amount || 0) : act.amount}`
                                    : isDebtRepay
                                    ? `-${formatVND ? formatVND(act.amount || 0) : act.amount}`
                                    : isDebtSpend
                                    ? `+${formatVND ? formatVND(act.amount || 0) : act.amount} nợ`
                                    : act.type === 'create_expense'
                                    ? `-${formatVND ? formatVND(act.amount || 0) : act.amount}`
                                    : formatVND
                                    ? formatVND(act.amount || 0)
                                    : act.amount}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Delete message button (on hover/focus) */}
                  {msg.id !== 'msg-welcome' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg.id)}
                      title="Xóa tin nhắn này"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shrink-0 mb-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isUser && (
                    <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mb-1">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading typing bubble */}
            {isLoading && (
              <div className="flex gap-2 items-end justify-start animate-in fade-in">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 shadow-xs">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl rounded-bl-xs px-4 py-2.5 shadow-xs flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" />
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    ⚡ Đang xử lý nhanh...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Suggestions (shown if conversation is short) */}
          {messages.length <= 3 && !isLoading && (
            <div className="px-3 py-2 bg-slate-100/70 dark:bg-slate-900 border-t border-slate-200/60 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {QUICK_PROMPTS.map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 whitespace-nowrap transition-colors cursor-pointer shadow-2xs shrink-0"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Box Footer */}
          <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!isSendingRef.current && !isLoading) {
                  handleSendMessage();
                }
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập yêu cầu thu chi hoặc hỏi đáp tài chính..."
                className="flex-1 max-h-24 resize-none text-xs sm:text-sm font-medium text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                title="Gửi tin nhắn"
                className="w-9 h-9 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
