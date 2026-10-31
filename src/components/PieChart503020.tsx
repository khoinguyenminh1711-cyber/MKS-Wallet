import React, { useState } from 'react';
import { ExpenseVoucher, RuleCategory } from '../types/finance';
import { ProportionSegment, DEFAULT_SEGMENTS } from './SegmentedProportionBar';

interface PieChart503020Props {
  vouchers: ExpenseVoucher[];
  savingsAmount?: number;
  monthlySalary: number;
  formatVND: (value: number) => string;
  proportions?: ProportionSegment[];
}

export const PieChart503020: React.FC<PieChart503020Props> = ({
  vouchers,
  savingsAmount = 0,
  monthlySalary,
  formatVND,
  proportions,
}) => {
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  // Active proportion segments configured by the user
  const segmentsList: ProportionSegment[] =
    proportions && proportions.length >= 2 ? proportions : DEFAULT_SEGMENTS;

  // Identify core segments for voucher categorization mapping
  const savingsSegment =
    segmentsList.find(
      (s) =>
        s.id === 'seg-savings' ||
        s.name.toLowerCase().includes('tiết kiệm') ||
        s.name.toLowerCase().includes('đầu tư') ||
        s.name.toLowerCase().includes('tích lũy') ||
        s.name.toLowerCase().includes('savings')
    ) || segmentsList[segmentsList.length - 1];

  const wantsSegment =
    segmentsList.find(
      (s) =>
        s.id === 'seg-wants' ||
        s.name.toLowerCase().includes('linh hoạt') ||
        s.name.toLowerCase().includes('cá nhân') ||
        s.name.toLowerCase().includes('hưởng thụ') ||
        s.name.toLowerCase().includes('giải trí') ||
        s.name.toLowerCase().includes('wants')
    ) || (segmentsList.length > 2 ? segmentsList[1] : null);

  const needsSegment =
    segmentsList.find(
      (s) =>
        s.id === 'seg-needs' ||
        s.name.toLowerCase().includes('thiết yếu') ||
        s.name.toLowerCase().includes('nhu cầu') ||
        s.name.toLowerCase().includes('cơ bản') ||
        s.name.toLowerCase().includes('needs')
    ) || segmentsList[0];

  // Accumulate spent amount by segment ID
  const amountBySegmentId: Record<string, number> = {};
  segmentsList.forEach((s) => {
    amountBySegmentId[s.id] = 0;
  });

  // Direct monthly savings transfers belong to the savings segment
  if (savingsSegment && amountBySegmentId[savingsSegment.id] !== undefined) {
    amountBySegmentId[savingsSegment.id] += Number(savingsAmount) || 0;
  }

  // Allocate expense vouchers to corresponding segments
  vouchers.forEach((v) => {
    const amt = Number(v.amount) || 0;
    const titleLower = (v.title || '').toLowerCase();
    const subCatLower = (v.subCategory || '').toLowerCase();

    // Check direct match with segment names
    const directMatch = segmentsList.find((s) => {
      const name = s.name.toLowerCase().trim();
      return name.length >= 3 && (titleLower.includes(name) || subCatLower.includes(name));
    });

    if (directMatch && amountBySegmentId[directMatch.id] !== undefined) {
      amountBySegmentId[directMatch.id] += amt;
      return;
    }

    if (v.category === 'savings_debt_20' || v.debtTarget === 'savings_fund') {
      const targetId = savingsSegment?.id || segmentsList[segmentsList.length - 1].id;
      amountBySegmentId[targetId] = (amountBySegmentId[targetId] || 0) + amt;
    } else if (v.category === 'wants_30') {
      const targetId = wantsSegment?.id || needsSegment.id;
      amountBySegmentId[targetId] = (amountBySegmentId[targetId] || 0) + amt;
    } else {
      const targetId = needsSegment.id;
      amountBySegmentId[targetId] = (amountBySegmentId[targetId] || 0) + amt;
    }
  });

  const totalSpent = Object.values(amountBySegmentId).reduce((sum, v) => sum + v, 0);

  // Compute SVG circle stroke-dasharray segments for Donut Chart
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  const computedSegments = segmentsList.map((seg) => {
    const amount = amountBySegmentId[seg.id] || 0;
    const actualPercentOfSpent = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;

    // Hạn mức ngân sách tính động theo tỷ lệ phần trăm người dùng đã cài đặt
    const recommendedBudget = (monthlySalary * seg.percentage) / 100;
    const budgetUsagePercent =
      recommendedBudget > 0 ? (amount / recommendedBudget) * 100 : 0;

    const strokeDasharray = `${(actualPercentOfSpent / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((cumulativePercent / 100) * circumference);
    cumulativePercent += actualPercentOfSpent;

    const remainingAmount = recommendedBudget - amount;
    const isOverBudget = remainingAmount < 0;

    return {
      id: seg.id,
      name: seg.name,
      percentage: seg.percentage,
      colorHex: seg.colorHex,
      gradient: seg.gradient,
      amount,
      actualPercentOfSpent,
      recommendedBudget,
      budgetUsagePercent,
      remainingAmount,
      isOverBudget,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const activeSegment =
    computedSegments.find((s) => s.id === hoveredSegmentId) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
      {/* Left: SVG Donut Chart */}
      <div className="lg:col-span-5 flex flex-col items-center justify-center p-4">
        <div className="relative w-52 h-52 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
            {/* Background track */}
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth="20"
              className="text-slate-200 dark:text-slate-800"
            />
            {totalSpent > 0 &&
              computedSegments.map((seg) => (
                <circle
                  key={seg.id}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="transparent"
                  stroke={seg.colorHex}
                  strokeWidth={hoveredSegmentId === seg.id ? '24' : '20'}
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={seg.strokeDashoffset}
                  strokeLinecap="butt"
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredSegmentId(seg.id)}
                  onMouseLeave={() => setHoveredSegmentId(null)}
                />
              ))}
          </svg>

          {/* Center Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none select-none">
            {activeSegment ? (
              <>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                  {activeSegment.name} ({activeSegment.percentage}%)
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {activeSegment.actualPercentOfSpent.toFixed(1)}%
                </span>
                <span className="text-xs font-mono tabular-nums text-teal-600 dark:text-teal-400 mt-0.5">
                  {formatVND(activeSegment.amount)}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Tổng chi trong tháng
                </span>
                <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {formatVND(totalSpent)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {vouchers.length} phiếu chi
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Dynamic Proportion Breakdown & Spending Status */}
      <div className="lg:col-span-7 space-y-4">
        {computedSegments.map((seg) => {
          const isHovered = hoveredSegmentId === seg.id;
          return (
            <div
              key={seg.id}
              onMouseEnter={() => setHoveredSegmentId(seg.id)}
              onMouseLeave={() => setHoveredSegmentId(null)}
              className={`p-4 rounded-xl border bg-slate-50/60 dark:bg-slate-900/50 transition-all cursor-pointer ${
                isHovered
                  ? 'border-teal-500 shadow-sm ring-1 ring-teal-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-teal-500/40'
              }`}
            >
              {/* Dòng tiêu đề: Phần trăm đã cài đặt, Tên phân đoạn & Tiền chi thực tế */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-xs shrink-0"
                    style={{ backgroundColor: seg.colorHex }}
                  />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {seg.percentage}% · {seg.name}
                  </h4>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <span className="text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatVND(seg.amount)}
                  </span>
                </div>
              </div>

              {/* Thanh tiến độ và số tiền Còn lại / Vượt */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1.5">
                  <span
                    className={
                      seg.isOverBudget
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : 'text-teal-600 dark:text-teal-400 font-medium'
                    }
                  >
                    {seg.isOverBudget
                      ? `Vượt ${formatVND(Math.abs(seg.remainingAmount))}`
                      : `Còn ${formatVND(seg.remainingAmount)}`}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, seg.budgetUsagePercent)}%`,
                      backgroundColor: seg.isOverBudget ? '#f43f5e' : seg.colorHex,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
