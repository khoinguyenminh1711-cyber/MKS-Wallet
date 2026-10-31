import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trash2,
  Plus,
  Wrench,
  RotateCcw,
  Check,
  ChevronDown,
  X,
} from 'lucide-react';

export interface ProportionSegment {
  id: string;
  name: string;
  percentage: number; // 2 to 100, sum always = 100
  gradient: string; // Tailwind gradient classes
  colorHex: string; // Base color for legend dot
}

export const DEFAULT_SEGMENTS: ProportionSegment[] = [
  {
    id: 'seg-needs',
    name: 'Thiết yếu',
    percentage: 50,
    gradient: 'from-emerald-500 to-teal-600',
    colorHex: '#10b981',
  },
  {
    id: 'seg-wants',
    name: 'Linh hoạt',
    percentage: 30,
    gradient: 'from-indigo-500 to-violet-600',
    colorHex: '#6366f1',
  },
  {
    id: 'seg-savings',
    name: 'Tiết kiệm & Đầu tư',
    percentage: 20,
    gradient: 'from-amber-500 to-orange-500',
    colorHex: '#f59e0b',
  },
];

export const COLOR_PALETTE = [
  { gradient: 'from-emerald-500 to-teal-600', colorHex: '#10b981' },
  { gradient: 'from-indigo-500 to-violet-600', colorHex: '#6366f1' },
  { gradient: 'from-amber-500 to-orange-500', colorHex: '#f59e0b' },
  { gradient: 'from-rose-500 to-pink-600', colorHex: '#f43f5e' },
  { gradient: 'from-sky-500 to-blue-600', colorHex: '#0ea5e9' },
  { gradient: 'from-purple-500 to-fuchsia-600', colorHex: '#a855f7' },
  { gradient: 'from-cyan-400 to-teal-500', colorHex: '#06b6d4' },
  { gradient: 'from-lime-500 to-emerald-500', colorHex: '#84cc16' },
  { gradient: 'from-coral-500 to-red-500', colorHex: '#ef4444' },
];

const STORAGE_KEY = 'mks_wallet_segmented_proportions_v1';
const MIN_PERCENT = 2; // Giới hạn tối thiểu mỗi phần không được nhỏ hơn 2%

interface SegmentedProportionBarProps {
  segments?: ProportionSegment[];
  onSegmentsChange?: (segments: ProportionSegment[]) => void;
}

export const SegmentedProportionBar: React.FC<SegmentedProportionBarProps> = ({
  segments: controlledSegments,
  onSegmentsChange,
}) => {
  const [internalSegments, setInternalSegments] = useState<ProportionSegment[]>(() => {
    if (controlledSegments && controlledSegments.length >= 2) {
      return controlledSegments;
    }
    return DEFAULT_SEGMENTS;
  });

  // Sync with controlled segments if provided
  useEffect(() => {
    if (controlledSegments && controlledSegments.length >= 2) {
      setInternalSegments(controlledSegments);
    }
  }, [controlledSegments]);

  const segments = controlledSegments && controlledSegments.length >= 2
    ? controlledSegments
    : internalSegments;

  const updateSegments = useCallback(
    (newSegments: ProportionSegment[]) => {
      setInternalSegments(newSegments);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSegments));
      } catch {
        // ignore
      }
      onSegmentsChange?.(newSegments);
    },
    [onSegmentsChange]
  );

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeDraggingHandleIndex, setActiveDraggingHandleIndex] = useState<number | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);

  // Add Segment Modal Form State
  const [newSegName, setNewSegName] = useState<string>('');
  const [newSegColorHex, setNewSegColorHex] = useState<string>(COLOR_PALETTE[0].colorHex);

  // Manage Segment Modal - Color Picker State
  const [activeColorPickerSegId, setActiveColorPickerSegId] = useState<string | null>(null);

  const barContainerRef = useRef<HTMLDivElement>(null);
  const startDragInfoRef = useRef<{
    handleIndex: number;
    startX: number;
    initialPercentages: number[];
  } | null>(null);

  // Drag start
  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    handleIdx: number
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startDragInfoRef.current = {
      handleIndex: handleIdx,
      startX: clientX,
      initialPercentages: segments.map((s) => s.percentage),
    };
    setActiveDraggingHandleIndex(handleIdx);
  };

  // Drag move logic
  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (!startDragInfoRef.current || !barContainerRef.current) return;

      const { handleIndex, startX, initialPercentages } = startDragInfoRef.current;
      const barRect = barContainerRef.current.getBoundingClientRect();
      const barWidth = barRect.width;
      if (barWidth <= 0) return;

      const deltaX = clientX - startX;
      const deltaPercentRaw = (deltaX / barWidth) * 100;
      const deltaPercent = Math.round(deltaPercentRaw); // Step integer 1%

      const leftIdx = handleIndex;
      const rightIdx = handleIndex + 1;

      const origLeft = initialPercentages[leftIdx];
      const origRight = initialPercentages[rightIdx];

      // Limit bounds so neither drops below MIN_PERCENT (2%)
      const minDelta = -(origLeft - MIN_PERCENT);
      const maxDelta = origRight - MIN_PERCENT;

      const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaPercent));

      const newLeft = origLeft + clampedDelta;
      const newRight = origRight - clampedDelta;

      if (newLeft === segments[leftIdx].percentage && newRight === segments[rightIdx].percentage) {
        return;
      }

      const updated = [...segments];
      updated[leftIdx] = { ...updated[leftIdx], percentage: newLeft };
      updated[rightIdx] = { ...updated[rightIdx], percentage: newRight };

      // Ensure sum is exactly 100%
      const currentSum = updated.reduce((s, seg) => s + seg.percentage, 0);
      if (currentSum !== 100) {
        updated[rightIdx] = {
          ...updated[rightIdx],
          percentage: updated[rightIdx].percentage + (100 - currentSum),
        };
      }

      updateSegments(updated);
    },
    [segments, updateSegments]
  );

  useEffect(() => {
    if (activeDraggingHandleIndex === null) return;

    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
      }
    };

    const onEnd = () => {
      setActiveDraggingHandleIndex(null);
      startDragInfoRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [activeDraggingHandleIndex, handlePointerMove]);

  // Open Add Segment Modal
  const handleOpenAddModal = () => {
    if (segments.length >= 8) return;
    const usedColors = new Set(segments.map((s) => s.colorHex));
    const nextColor =
      COLOR_PALETTE.find((c) => !usedColors.has(c.colorHex)) ||
      COLOR_PALETTE[segments.length % COLOR_PALETTE.length];

    setNewSegName(`Phân đoạn ${segments.length + 1}`);
    setNewSegColorHex(nextColor.colorHex);
    setIsAddModalOpen(true);
  };

  // Confirm Add Segment from Modal
  const handleConfirmAddSegment = () => {
    const trimmed = newSegName.trim();
    if (!trimmed || segments.length >= 8) return;

    // Find segment with largest percentage to take share from
    const largestIdx = segments.reduce(
      (maxIdx, s, idx, arr) => (s.percentage > arr[maxIdx].percentage ? idx : maxIdx),
      0
    );
    const target = segments[largestIdx];
    if (target.percentage < 10) return;

    const transferPct = Math.min(10, Math.floor(target.percentage / 2));
    const newPct = transferPct;
    const updatedTargetPct = target.percentage - transferPct;

    const selectedColorObj =
      COLOR_PALETTE.find((c) => c.colorHex === newSegColorHex) ||
      COLOR_PALETTE[segments.length % COLOR_PALETTE.length];

    const newSeg: ProportionSegment = {
      id: `seg-${Date.now()}`,
      name: trimmed,
      percentage: newPct,
      gradient: selectedColorObj.gradient,
      colorHex: selectedColorObj.colorHex,
    };

    const updated = [...segments];
    updated[largestIdx] = { ...target, percentage: updatedTargetPct };
    updated.push(newSeg);
    updateSegments(updated);
    setIsAddModalOpen(false);
  };

  // Delete Segment (Xóa và gộp % vào phần liền kề)
  const handleDeleteSegment = (id: string) => {
    if (segments.length <= 2) return;

    const idx = segments.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const target = segments[idx];
    const updated = [...segments];

    if (idx > 0) {
      updated[idx - 1] = {
        ...updated[idx - 1],
        percentage: updated[idx - 1].percentage + target.percentage,
      };
    } else {
      updated[1] = {
        ...updated[1],
        percentage: updated[1].percentage + target.percentage,
      };
    }

    updated.splice(idx, 1);
    updateSegments(updated);
  };

  // Update segment name inside manage modal
  const handleRenameSegment = (id: string, name: string) => {
    const updated = segments.map((s) => (s.id === id ? { ...s, name } : s));
    updateSegments(updated);
  };

  // Update segment color inside manage modal
  const handleSelectSegmentColor = (id: string, colorHex: string, gradient: string) => {
    const updated = segments.map((s) =>
      s.id === id ? { ...s, colorHex, gradient } : s
    );
    updateSegments(updated);
    setActiveColorPickerSegId(null);
  };

  // Apply predefined template (50-30-20, 60-20-20, 70-20-10)
  const handleApplyPreset = (percentages: number[]) => {
    const names = ['Thiết yếu', 'Linh hoạt', 'Tiết kiệm & Đầu tư'];
    const newSegments: ProportionSegment[] = percentages.map((pct, idx) => {
      const existing = segments[idx];
      const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      return {
        id: existing?.id || `seg-${idx}`,
        name: existing?.name || names[idx] || `Phần ${idx + 1}`,
        percentage: pct,
        gradient: color.gradient,
        colorHex: color.colorHex,
      };
    });
    updateSegments(newSegments);
  };

  const handleResetToDefault = () => {
    updateSegments(DEFAULT_SEGMENTS);
    setIsResetConfirmOpen(false);
  };

  return (
    <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all shadow-xs">
      {/* Header: Đơn giản & đồng nhất như Dòng tiền cố định */}
      <div
        className={`flex items-center justify-between cursor-pointer select-none transition-all ${
          isOpen ? 'pb-5 border-b border-slate-200 dark:border-slate-800' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Điều chỉnh tỷ lệ
          </h2>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          title={isOpen ? 'Thu gọn các mục bên dưới' : 'Hiện các mục bên dưới'}
          aria-label="Mở rộng / thu gọn điều chỉnh tỷ lệ"
          className="w-10 h-10 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs"
        >
          <ChevronDown
            className={`w-5 h-5 transition-transform duration-300 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Expanded Content: Thanh trượt & chú thích bên dưới */}
      {isOpen && (
        <div className="animate-in fade-in zoom-in-95 duration-150 pt-5 space-y-5">
          {/* THE MAIN SEGMENTED BAR: Clean & uncluttered */}
          <div className="relative pt-2 pb-1 select-none">
            {/* Track Container */}
            <div
              ref={barContainerRef}
              className="relative w-full h-14 sm:h-16 rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-100 dark:bg-slate-800/80 shadow-inner flex border border-slate-200/80 dark:border-slate-700/60 transition-all"
            >
              {segments.map((seg) => (
                <div
                  key={seg.id}
                  style={{ width: `${seg.percentage}%` }}
                  className={`relative h-full bg-gradient-to-r ${seg.gradient} transition-[width] duration-75 flex items-center justify-center overflow-hidden select-none`}
                >
                  {/* Clean text inside Segment */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-2 pointer-events-none text-white drop-shadow-sm font-semibold transition-opacity">
                    {seg.percentage >= 14 ? (
                      <>
                        <span className="text-xs sm:text-sm font-bold truncate max-w-full">
                          {seg.name}
                        </span>
                        <span className="text-xs font-mono font-medium opacity-90">
                          {seg.percentage}%
                        </span>
                      </>
                    ) : seg.percentage >= 8 ? (
                      <span className="text-xs font-mono font-bold">
                        {seg.percentage}%
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* DRAGGABLE HANDLES ON THE PARTITIONS */}
            {segments.slice(0, -1).map((_, handleIdx) => {
              const cumPercent = segments
                .slice(0, handleIdx + 1)
                .reduce((sum, s) => sum + s.percentage, 0);

              const isDraggingThis = activeDraggingHandleIndex === handleIdx;

              return (
                <div
                  key={`handle-${handleIdx}`}
                  style={{ left: `${cumPercent}%` }}
                  onMouseDown={(e) => handleDragStart(e, handleIdx)}
                  onTouchStart={(e) => handleDragStart(e, handleIdx)}
                  className="absolute top-2 bottom-1 -translate-x-1/2 flex items-center justify-center z-20 cursor-col-resize touch-none group"
                >
                  {/* Visible drag handle pill */}
                  <div
                    className={`w-3.5 h-10 sm:h-12 rounded-full border-2 transition-all flex items-center justify-center shadow-md select-none ${
                      isDraggingThis
                        ? 'bg-white border-teal-500 ring-4 ring-teal-500/30 scale-110'
                        : 'bg-white/95 dark:bg-slate-900/95 border-slate-300 dark:border-slate-600 group-hover:border-teal-500 group-hover:scale-105 group-hover:shadow-lg'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 items-center">
                      <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500 group-hover:bg-teal-500" />
                      <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500 group-hover:bg-teal-500" />
                      <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500 group-hover:bg-teal-500" />
                    </div>
                  </div>

                  {/* Tooltip while dragging */}
                  {isDraggingThis && (
                    <div className="absolute -top-7 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-mono font-bold shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in duration-75">
                      {cumPercent}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* SECTION: PHÂN ĐOẠN - GIAO DIỆN HIỂN THỊ TINH GỌN (THEO HÌNH ẢNH) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Phân đoạn
                </h3>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                  ({segments.length})
                </span>
              </div>

              {/* Action buttons: Reset (Đã chuyển xuống bên trái dấu thêm), + (Mở cửa sổ thêm mới) và Cờ lê (Mở cửa sổ quản lý) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(true)}
                  title="Đặt lại tỷ lệ mặc định ban đầu (50-30-20)"
                  aria-label="Đặt lại tỷ lệ mặc định"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  disabled={segments.length >= 8}
                  title={segments.length >= 8 ? 'Đã đạt tối đa 8 phân đoạn' : 'Thêm phân đoạn mới (Mở cửa sổ)'}
                  aria-label="Thêm phân đoạn mới"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveColorPickerSegId(null);
                    setIsManageModalOpen(true);
                  }}
                  title="Quản lý / chỉnh sửa / xóa phân đoạn (Mở cửa sổ)"
                  aria-label="Quản lý phân đoạn"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <Wrench className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List of Segments: HIỂN THỊ CHỈ ĐỌC - KHÔNG SỬA TRỰC TIẾP Ở MỤC CHÍNH */}
            <div className="space-y-2">
              {segments.map((seg) => (
                <div
                  key={`display-seg-${seg.id}`}
                  className="px-4 py-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-4 h-4 rounded-full shrink-0 shadow-xs ring-2 ring-black/5 dark:ring-white/10"
                      style={{ backgroundColor: seg.colorHex }}
                    />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate select-none">
                      {seg.name}
                    </span>
                  </div>

                  <div className="shrink-0 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-100 shadow-xs">
                    {seg.percentage}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Thêm phân đoạn mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-500" />
                <span>Thêm phân đoạn mới</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên phân đoạn
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newSegName}
                  onChange={(e) => setNewSegName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddSegment();
                    if (e.key === 'Escape') setIsAddModalOpen(false);
                  }}
                  placeholder="Ví dụ: Học tập, Du lịch, Quỹ dự phòng..."
                  className="w-full text-sm font-medium text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Màu sắc đại diện
                </label>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {COLOR_PALETTE.map((c) => {
                    const isSelected = newSegColorHex === c.colorHex;
                    return (
                      <button
                        key={c.colorHex}
                        type="button"
                        onClick={() => setNewSegColorHex(c.colorHex)}
                        style={{ backgroundColor: c.colorHex }}
                        className={`w-7 h-7 rounded-full transition-transform cursor-pointer shadow-xs flex items-center justify-center ring-2 ${
                          isSelected ? 'ring-teal-500 scale-110 shadow-md' : 'ring-transparent hover:scale-105'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200/50 dark:border-teal-800/40 text-xs text-teal-800 dark:text-teal-300 leading-relaxed">
                Tỷ lệ ban đầu được tự động trích 10% từ phân đoạn có tỷ lệ lớn nhất để đảm bảo tổng luôn là 100%. Sau khi thêm, bạn có thể kéo thanh trượt để tinh chỉnh lại.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!newSegName.trim()}
                onClick={handleConfirmAddSegment}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Thêm phân đoạn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Quản lý phân đoạn */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-teal-500" />
                  <span>Quản lý phân đoạn</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Đổi tên, chọn màu sắc hoặc xóa phân đoạn (Tối thiểu 2 phân đoạn)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManageModalOpen(false);
                  setActiveColorPickerSegId(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of segments to edit */}
            <div className="my-4 overflow-y-auto space-y-3 flex-1 pr-1">
              {segments.map((seg) => {
                const canDelete = segments.length > 2;
                const isPickingColor = activeColorPickerSegId === seg.id;

                return (
                  <div
                    key={`manage-seg-${seg.id}`}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Color button */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveColorPickerSegId(isPickingColor ? null : seg.id)
                        }
                        title="Bấm để đổi màu sắc phân đoạn này"
                        className="w-5 h-5 rounded-full shrink-0 shadow-xs ring-2 ring-black/10 dark:ring-white/20 hover:scale-110 cursor-pointer transition-transform"
                        style={{ backgroundColor: seg.colorHex }}
                      />

                      {/* Name input */}
                      <input
                        type="text"
                        value={seg.name}
                        onChange={(e) => handleRenameSegment(seg.id, e.target.value)}
                        placeholder="Tên phân đoạn..."
                        className="flex-1 min-w-0 text-sm font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-teal-500"
                      />

                      {/* Percentage Badge */}
                      <span className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                        {seg.percentage}%
                      </span>

                      {/* Delete button */}
                      <button
                        type="button"
                        disabled={!canDelete}
                        onClick={() => handleDeleteSegment(seg.id)}
                        title={
                          canDelete
                            ? `Xóa mục "${seg.name}" và gộp tỷ lệ vào mục liền kề`
                            : 'Không thể xóa khi chỉ còn 2 phân đoạn'
                        }
                        aria-label={`Xóa phân đoạn ${seg.name}`}
                        className={`p-1.5 rounded-lg transition-colors ${
                          canDelete
                            ? 'text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer'
                            : 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Color palette popover for this segment */}
                    {isPickingColor && (
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 flex-wrap animate-in fade-in">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                          Chọn màu:
                        </span>
                        {COLOR_PALETTE.map((c) => {
                          const isSelected = seg.colorHex === c.colorHex;
                          return (
                            <button
                              key={c.colorHex}
                              type="button"
                              onClick={() =>
                                handleSelectSegmentColor(seg.id, c.colorHex, c.gradient)
                              }
                              style={{ backgroundColor: c.colorHex }}
                              className={`w-5 h-5 rounded-full cursor-pointer shadow-xs transition-transform flex items-center justify-center ${
                                isSelected ? 'ring-2 ring-teal-500 scale-125' : 'hover:scale-110'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsManageModalOpen(false);
                  setIsResetConfirmOpen(true);
                }}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Đặt lại chuẩn 50-30-20</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsManageModalOpen(false);
                  setActiveColorPickerSegId(null);
                }}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset to Default 50-30-20 */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-teal-500" />
                <span>Đặt lại tỷ lệ mặc định</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn có chắc muốn đặt lại tỷ lệ về chuẩn mặc định ban đầu:
            </p>
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 text-xs font-medium">
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Thiết yếu:</span>
                <span className="font-mono font-bold">50%</span>
              </div>
              <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
                <span>Linh hoạt:</span>
                <span className="font-mono font-bold">30%</span>
              </div>
              <div className="flex justify-between text-amber-500 dark:text-amber-400">
                <span>Tiết kiệm & Đầu tư:</span>
                <span className="font-mono font-bold">20%</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
              >
                Đặt Lại 50-30-20
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
