import React, { useState } from 'react';
import { Check, Copy, Database, FileCode, Terminal } from 'lucide-react';
import { FLUTTER_BLUEPRINT_FILES } from '../data/flutterBlueprint';

export const FlutterBlueprintView: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>(FLUTTER_BLUEPRINT_FILES[1].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile =
    FLUTTER_BLUEPRINT_FILES.find((f) => f.id === selectedFileId) ||
    FLUTTER_BLUEPRINT_FILES[0];

  const handleCopy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture Overview Banner */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Kiến trúc Flutter Clean Architecture & Cơ sở dữ liệu SQLite
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Mã nguồn chuẩn hóa cho Android (Flutter + sqflite + fl_chart + Riverpod) được thiết kế riêng cho quy trình Phiếu Tháng & Quy tắc 50-30-20 của Khoi S-Money.
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono shrink-0">
            <span>Flutter 3.22+</span>
            <span className="mx-2">·</span>
            <span>sqflite</span>
            <span className="mx-2">·</span>
            <span>fl_chart</span>
          </div>
        </div>

        {/* 3 Architectural Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-600 dark:text-teal-400">
              <Database className="w-4 h-4 shrink-0" />
              <span>01. Data Layer (SQLite / sqflite)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Bảng <code className="font-mono text-slate-800 dark:text-slate-200">monthly_sheets</code> lưu số dư khởi tạo đầu tháng (MB, OCB, ACB, Tiền mặt, Nợ tín dụng, Shopee Pay Later) kết nối khóa ngoại 1-N với bảng <code className="font-mono text-slate-800 dark:text-slate-200">expense_vouchers</code>.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400">
              <FileCode className="w-4 h-4 shrink-0" />
              <span>02. Domain Layer (Entities & Rules)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Tự động tính Tài sản ròng thực tế (<code className="font-mono text-slate-800 dark:text-slate-200">Tổng tài sản - Tổng nợ</code>), trừ lùi số dư từng ngân hàng/ví theo thời gian thực và khấu trừ công nợ khi tạo phiếu thuộc nhóm 20%.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              <Terminal className="w-4 h-4 shrink-0" />
              <span>03. Presentation Layer (fl_chart)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Sử dụng <code className="font-mono text-slate-800 dark:text-slate-200">PieChart</code> từ thư viện <code className="font-mono text-slate-800 dark:text-slate-200">fl_chart</code> để hiển thị trực quan tỷ lệ 50% Thiết yếu - 30% Cá nhân - 20% Tiết kiệm/Trả nợ.
            </p>
          </div>
        </div>
      </div>

      {/* Code Explorer Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* File Selector List */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Cấu trúc Tập tin Dự án Flutter
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {FLUTTER_BLUEPRINT_FILES.map((file) => {
              const isSelected = file.id === activeFile.id;
              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="text-sm font-semibold">{file.title}</span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {file.path}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Code Content Viewer */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>{activeFile.layer}</span>
                <span>·</span>
                <span className="truncate">{activeFile.path}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {activeFile.description}
              </p>
            </div>

            <button
              onClick={() => handleCopy(activeFile.id, activeFile.code)}
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-teal-500 hover:text-white dark:hover:bg-teal-500 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedId === activeFile.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép mã</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-5 text-xs font-mono leading-relaxed overflow-x-auto bg-slate-950 text-slate-100 max-h-[540px]">
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
