import React, { useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Target,
} from 'lucide-react';
import {
  FinancialGoal,
  WalletMeta,
  DebtMeta,
  MonthlySheet,
  InitialBalanceVoucher,
} from '../types/finance';

interface FinancialGoalsViewProps {
  goals: FinancialGoal[];
  onAddGoal: (goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => void;
  onUpdateGoal: (goal: FinancialGoal) => void;
  onDeleteGoal: (goalId: string) => void;
  wallets: WalletMeta[];
  debts: DebtMeta[];
  sheets: MonthlySheet[];
  activeSheetId: string;
}

export function FinancialGoalsView({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  wallets,
  debts,
  sheets,
  activeSheetId,
}: FinancialGoalsViewProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);

  // Add/Edit Form State
  const [title, setTitle] = useState<string>('');
  const [targetAmountStr, setTargetAmountStr] = useState<string>('');
  const [category, setCategory] = useState<FinancialGoal['category']>('savings');
  const [deadline, setDeadline] = useState<string>('');
  const [linkedWalletKey, setLinkedWalletKey] = useState<string>('');
  const [linkedDebtKey, setLinkedDebtKey] = useState<string>('');

  // Auto-calculated monthly savings rate from recent sheets
  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[sheets.length - 1];

  const savingsWallets = React.useMemo(() => {
    const list = wallets.filter(
      (w) =>
        w.key === 'savings' ||
        w.bankCode === 'SAVINGS' ||
        w.name.toLowerCase().includes('tiết kiệm') ||
        w.key.startsWith('savings_')
    );
    if (list.length > 0) return list;
    return [{ key: 'savings', name: 'Tiết kiệm', shortName: 'Tiết kiệm', bankCode: 'SAVINGS' }];
  }, [wallets]);

  const effectiveMonthlySavingsAvg = React.useMemo(() => {
    if (!sheets || sheets.length === 0) return 0;
    const recentSheets = sheets.slice(-3);
    let totalSavings = 0;
    recentSheets.forEach((s) => {
      const svTotal = (s.savingsVouchers || []).reduce((acc, sv) => acc + (sv.amount || 0), 0);
      totalSavings += svTotal;
    });
    return Math.round(totalSavings / recentSheets.length) || 2000000;
  }, [sheets]);

  // Current wallet balances from activeSheet
  const getWalletBalance = (wKey: string): number => {
    if (!activeSheet) return 0;
    const initial = Number(activeSheet.initialBalances[wKey as keyof InitialBalanceVoucher]) || 0;
    const incomes = (activeSheet.incomeVouchers || [])
      .filter((iv) => iv.targetWallet === wKey)
      .reduce((sum, iv) => sum + iv.amount, 0);
    const expenses = (activeSheet.vouchers || [])
      .filter((ev) => ev.sourceWallet === wKey)
      .reduce((sum, ev) => sum + ev.amount, 0);
    const savingsIn = (activeSheet.savingsVouchers || [])
      .filter((sv) => sv.toWallet === wKey)
      .reduce((sum, sv) => sum + sv.amount, 0);
    const savingsOut = (activeSheet.savingsVouchers || [])
      .filter((sv) => sv.fromWallet === wKey)
      .reduce((sum, sv) => sum + sv.amount, 0);
    const expenseSavingsFundTotal =
      (wKey === 'savings' || wKey.startsWith('savings_'))
        ? (activeSheet.vouchers || [])
            .filter((v) => v.debtTarget === 'savings_fund')
            .reduce((sum, v) => sum + v.amount, 0)
        : 0;

    return Math.max(0, initial + incomes - expenses + savingsIn - savingsOut + expenseSavingsFundTotal);
  };

  const getEffectiveGoalCurrent = (g: FinancialGoal): number => {
    if (g.linkedWalletKey) {
      return getWalletBalance(g.linkedWalletKey);
    }
    return g.currentAmount;
  };

  const handleOpenAdd = () => {
    setTitle('');
    setTargetAmountStr('');
    setCategory('savings');
    setDeadline('');
    setLinkedWalletKey(savingsWallets[0]?.key || '');
    setLinkedDebtKey('');
    setEditingGoal(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (g: FinancialGoal) => {
    setEditingGoal(g);
    setTitle(g.title);
    setTargetAmountStr(g.targetAmount.toLocaleString('vi-VN'));
    setCategory(g.category);
    setDeadline(g.deadline || '');
    setLinkedWalletKey(g.linkedWalletKey || savingsWallets[0]?.key || '');
    setLinkedDebtKey(g.linkedDebtKey || '');
    setIsAddModalOpen(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmt = Number(targetAmountStr.replace(/\D/g, ''));
    if (!targetAmt || targetAmt <= 0) return;

    const chosenWallet = linkedWalletKey || savingsWallets[0]?.key || undefined;

    if (editingGoal) {
      onUpdateGoal({
        ...editingGoal,
        title: title.trim(),
        targetAmount: targetAmt,
        currentAmount: editingGoal.currentAmount || 0,
        category,
        deadline: deadline || undefined,
        linkedWalletKey: chosenWallet,
        linkedDebtKey: linkedDebtKey || undefined,
      });
    } else {
      onAddGoal({
        title: title.trim(),
        targetAmount: targetAmt,
        currentAmount: 0,
        category,
        deadline: deadline || undefined,
        linkedWalletKey: chosenWallet,
        linkedDebtKey: linkedDebtKey || undefined,
      });
    }
    setIsAddModalOpen(false);
  };

  const formatVND = (num: number) => {
    return (num || 0).toLocaleString('vi-VN') + '\u00A0đ';
  };

  return (
    <div className="space-y-6">
      {/* Header bar: Title "Mục tiêu" + Icon-only Add button */}
      <div className="flex items-center justify-between gap-4 p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          Mục tiêu
        </h2>

        {/* Thêm mục tiêu mới: chỉ hiển thị icon dấu cộng */}
        <button
          type="button"
          onClick={handleOpenAdd}
          title="Thêm mục tiêu mới"
          className="w-9 h-9 rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-xs flex items-center justify-center transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Goal Cards Grid */}
      {goals.length === 0 ? (
        <div className="p-10 sm:p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <Target className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Chưa có mục tiêu tài chính nào
          </h3>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo mục tiêu đầu tiên</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {goals.map((g) => {
            const current = getEffectiveGoalCurrent(g);
            const percent = Math.min(100, Math.round((current / g.targetAmount) * 100));
            const remaining = Math.max(0, g.targetAmount - current);
            const estimatedMonths =
              effectiveMonthlySavingsAvg > 0
                ? Math.ceil(remaining / effectiveMonthlySavingsAvg)
                : null;

            return (
              <div
                key={g.id}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col justify-between hover:border-teal-500/40 dark:hover:border-teal-500/40 transition-all gap-4"
              >
                {/* Header: Title + Action buttons (No washed-out category line) */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                    {g.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0 -mr-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(g)}
                      className="p-1.5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Chỉnh sửa mục tiêu"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteGoal(g.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Xóa mục tiêu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress and Numbers */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5 font-mono tabular-nums min-w-0">
                      <span className="text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                        {formatVND(current)}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        / {formatVND(g.targetAmount)}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold shrink-0 ${
                        percent >= 100
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                      }`}
                    >
                      {percent}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        percent >= 100
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                          : 'bg-gradient-to-r from-teal-500 to-emerald-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* Footer: Timeline / Estimation / Linked Info */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    {percent >= 100 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Đã hoàn thành!</span>
                      </span>
                    ) : estimatedMonths !== null && estimatedMonths > 0 ? (
                      <span className="truncate block">
                        Dự kiến: <strong className="font-mono text-slate-800 dark:text-slate-200">~{estimatedMonths} tháng</strong>
                      </span>
                    ) : (
                      <span className="truncate block">
                        Còn thiếu: <strong className="font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">{formatVND(remaining)}</strong>
                      </span>
                    )}
                  </div>

                  {g.deadline ? (
                    <span className="text-[11px] text-slate-400 shrink-0 font-medium whitespace-nowrap">
                      Hạn: {g.deadline}
                    </span>
                  ) : g.linkedWalletKey ? (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0 truncate max-w-[140px] font-medium whitespace-nowrap">
                      Tiết kiệm: {savingsWallets.find((w) => w.key === g.linkedWalletKey)?.name || wallets.find((w) => w.key === g.linkedWalletKey)?.name || g.linkedWalletKey}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Goal Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingGoal ? 'Chỉnh sửa Mục tiêu' : 'Tạo Mục tiêu Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên mục tiêu
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Quỹ khẩn cấp 50 triệu, Mua xe máy, Trả hết nợ thẻ..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số tiền mục tiêu (VNĐ)
                </label>
                <input
                  type="text"
                  required
                  value={targetAmountStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setTargetAmountStr(raw ? Number(raw).toLocaleString('vi-VN') : '');
                  }}
                  placeholder="50.000.000"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tự động đồng bộ số dư theo Ví
                </label>
                <select
                  value={linkedWalletKey}
                  onChange={(e) => setLinkedWalletKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500 cursor-pointer"
                >
                  {savingsWallets.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Phân loại
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FinancialGoal['category'])}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-teal-500 cursor-pointer"
                >
                  <option value="savings">Tích lũy chung</option>
                  <option value="emergency_fund">Quỹ dự phòng khẩn cấp</option>
                  <option value="debt_payoff">Lộ trình trả dứt nợ</option>
                  <option value="purchase">Mua sắm tài sản lớn</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Hạn chót mong muốn (Tùy chọn)
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingGoal ? 'Lưu thay đổi' : 'Tạo mục tiêu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
