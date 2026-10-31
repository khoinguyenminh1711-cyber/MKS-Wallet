import React, { useState, useEffect } from 'react';
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Trash2,
  Plus,
  GripVertical,
  PieChart as PieChartIcon,
  Wallet,
  Scan,
  BookmarkCheck,
  ReceiptText,
  Target,
  BarChart3,
} from 'lucide-react';
import {
  BottomNavItemKey,
  DEFAULT_BOTTOM_NAV_ITEMS,
  BOTTOM_NAV_ITEM_CONFIG,
} from '../types/finance';

interface NavSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentOrder: BottomNavItemKey[];
  onSaveOrder: (newOrder: BottomNavItemKey[]) => void;
  isSyncingSheets?: boolean;
}

const ALL_NAV_KEYS: BottomNavItemKey[] = [
  'dashboard',
  'initial_voucher',
  'scan',
  'fixed_presets',
  'expense_vouchers',
  'financial_goals',
];

export function NavSettingsModal({
  isOpen,
  onClose,
  currentOrder,
  onSaveOrder,
  isSyncingSheets = false,
}: NavSettingsModalProps) {
  const [order, setOrder] = useState<BottomNavItemKey[]>(() => {
    if (Array.isArray(currentOrder) && currentOrder.length === 5) {
      return [...currentOrder];
    }
    return [...DEFAULT_BOTTOM_NAV_ITEMS];
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isAddingItem, setIsAddingItem] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Sync state whenever modal opens or currentOrder updates
  useEffect(() => {
    if (isOpen) {
      if (Array.isArray(currentOrder) && currentOrder.length === 5) {
        setOrder([...currentOrder]);
      } else {
        setOrder([...DEFAULT_BOTTOM_NAV_ITEMS]);
      }
      setIsAddingItem(false);
      setSavedSuccess(false);
      setDraggedIndex(null);
    }
  }, [isOpen, currentOrder]);

  if (!isOpen) return null;

  const renderNavIcon = (key: BottomNavItemKey, className: string = 'w-4 h-4') => {
    switch (key) {
      case 'dashboard':
        return <PieChartIcon className={className} />;
      case 'initial_voucher':
        return <Wallet className={className} />;
      case 'scan':
        return <Scan className={className} />;
      case 'fixed_presets':
        return <BookmarkCheck className={className} />;
      case 'expense_vouchers':
        return <ReceiptText className={className} />;
      case 'financial_goals':
        return <Target className={className} />;
      default:
        return <PieChartIcon className={className} />;
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newArr = [...order];
    const [moved] = newArr.splice(draggedIndex, 1);
    newArr.splice(index, 0, moved);
    setDraggedIndex(index);
    setOrder(newArr);
    setSavedSuccess(false);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleChangeItem = (index: number, newKey: BottomNavItemKey) => {
    const existingIndex = order.indexOf(newKey);
    const newArr = [...order];
    if (existingIndex !== -1 && existingIndex !== index) {
      // Swap positions
      const currentKey = newArr[index];
      newArr[index] = newKey;
      newArr[existingIndex] = currentKey;
    } else {
      newArr[index] = newKey;
    }
    setOrder(newArr);
    setSavedSuccess(false);
  };

  const handleRemoveItem = (index: number) => {
    const newArr = order.filter((_, idx) => idx !== index);
    setOrder(newArr);
    setIsAddingItem(true);
    setSavedSuccess(false);
  };

  const handleAddItem = (key: BottomNavItemKey) => {
    if (order.length >= 5 || order.includes(key)) return;
    setOrder([...order, key]);
    setIsAddingItem(false);
    setSavedSuccess(false);
  };

  const handleResetDefault = () => {
    setOrder([...DEFAULT_BOTTOM_NAV_ITEMS]);
    setIsAddingItem(false);
    setSavedSuccess(false);
  };

  const handleSave = () => {
    // If user has fewer than 5 items, fill remaining slots from DEFAULT_BOTTOM_NAV_ITEMS
    let finalOrder = [...order];
    if (finalOrder.length < 5) {
      DEFAULT_BOTTOM_NAV_ITEMS.forEach((fallbackKey) => {
        if (finalOrder.length < 5 && !finalOrder.includes(fallbackKey)) {
          finalOrder.push(fallbackKey);
        }
      });
    }
    onSaveOrder(finalOrder);
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const availableToAdd = ALL_NAV_KEYS.filter((k) => !order.includes(k));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header - Subtitle removed as requested */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Cài đặt vị trí thanh điều hướng
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Live Preview Box */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Xem trước thanh điều hướng
              </span>
              <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                Giao diện điện thoại
              </span>
            </div>

            {/* Mock Navigation Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl grid grid-cols-5 items-center h-15 px-1 shadow-xs select-none">
              {order.map((key, idx) => {
                const config = BOTTOM_NAV_ITEM_CONFIG[key];
                const isScan = key === 'scan';

                if (isScan) {
                  return (
                    <div key={idx} className="flex flex-col items-center justify-center h-full">
                      <div className="w-9 h-9 -mt-2 rounded-full bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-500 text-white shadow-md shadow-teal-500/30 flex items-center justify-center border-2 border-white dark:border-slate-900">
                        <Scan className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 tracking-tight mt-0.5">
                        {config?.shortLabel || 'Scan'}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {renderNavIcon(key, 'w-4 h-4')}
                    </div>
                    <span className="text-[9px] font-medium tracking-tight mt-1 truncate max-w-[56px] text-center">
                      {config?.shortLabel || key}
                    </span>
                  </div>
                );
              })}

              {/* Placeholder slots if order has fewer than 5 items */}
              {Array.from({ length: Math.max(0, 5 - order.length) }).map((_, emptyIdx) => (
                <div
                  key={`empty-${emptyIdx}`}
                  className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-600"
                >
                  <div className="w-4 h-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-sm" />
                  <span className="text-[9px] mt-1 text-slate-400 dark:text-slate-600">Trống</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Vị trí sắp xếp */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Vị trí sắp xếp
              </span>
              <button
                type="button"
                onClick={handleResetDefault}
                title="Khôi phục mặc định"
                className="p-1 rounded-lg text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Reorderable items list with 3-dots drag handle and trash button */}
            <div className="space-y-2">
              {order.map((key, index) => {
                const config = BOTTOM_NAV_ITEM_CONFIG[key];
                const isDragging = draggedIndex === index;

                return (
                  <div
                    key={`${key}-${index}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all gap-3 ${
                      isDragging
                        ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/40 opacity-70 scale-[0.99]'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-teal-500/50'
                    }`}
                  >
                    {/* Left: Drag Handle (3 dots / Grip dots) + Icon + Title Select */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* 3-dots drag handle */}
                      <div
                        title="Kéo thả để sắp xếp vị trí"
                        className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Icon */}
                      <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        {renderNavIcon(key, 'w-4 h-4')}
                      </div>

                      {/* Title Selector (no small description below) */}
                      <div className="min-w-0 flex-1">
                        <select
                          value={key}
                          onChange={(e) => handleChangeItem(index, e.target.value as BottomNavItemKey)}
                          className="text-sm font-semibold text-slate-900 dark:text-white bg-transparent border-none focus:outline-hidden cursor-pointer w-full py-0.5"
                        >
                          {ALL_NAV_KEYS.map((optKey) => {
                            const optConfig = BOTTOM_NAV_ITEM_CONFIG[optKey];
                            return (
                              <option
                                key={optKey}
                                value={optKey}
                                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-1"
                              >
                                {optConfig?.label || optKey}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Right: Trash button to remove item */}
                    <div className="shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        title="Xóa mục này khỏi thanh điều hướng"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add item slot if fewer than 5 items */}
              {order.length < 5 && (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingItem(!isAddingItem)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-400 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 font-medium text-xs transition-colors cursor-pointer bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm mục ({order.length}/5)</span>
                  </button>

                  {/* Dropdown list of available items to add */}
                  {isAddingItem && availableToAdd.length > 0 && (
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Chọn mục muốn thêm:
                      </div>
                      {availableToAdd.map((addKey) => {
                        const optConfig = BOTTOM_NAV_ITEM_CONFIG[addKey];
                        return (
                          <button
                            key={addKey}
                            type="button"
                            onClick={() => handleAddItem(addKey)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-950/60 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer text-left"
                          >
                            <div className="w-7 h-7 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                              {renderNavIcon(addKey, 'w-3.5 h-3.5')}
                            </div>
                            <span>{optConfig?.label || addKey}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSyncingSheets}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Đã lưu thành công!</span>
              </>
            ) : (
              <span>Lưu & Áp dụng</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
