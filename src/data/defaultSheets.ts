import { MonthlySheet } from '../types/finance';

export const DEFAULT_MONTHLY_SHEETS: MonthlySheet[] = [
  {
    id: '2026-10',
    month: 10,
    year: 2026,
    label: 'Tháng 10/2026',
    createdAt: '2026-10-01T00:00:00.000Z',
    initialBalances: {
      cash: 0,
      bank: 0,
      savings: 0,
      savings_emergency: 0,
      creditCard: 0,
      updatedAt: '2026-10-01T00:00:00.000Z',
      note: 'Khởi tạo số dư đầu tháng bằng 0',
    },
    incomeVouchers: [],
    vouchers: [],
    savingsVouchers: [],
  },
];
