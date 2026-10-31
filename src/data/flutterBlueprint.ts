export interface BlueprintFile {
  id: string;
  title: string;
  path: string;
  layer: string;
  description: string;
  language: 'dart' | 'yaml' | 'sql' | 'bash';
  code: string;
}

export const FLUTTER_BLUEPRINT_FILES: BlueprintFile[] = [
  {
    id: 'pubspec',
    title: '1. Cấu hình Thư viện (pubspec.yaml)',
    path: 'pubspec.yaml',
    layer: 'Configuration',
    description: 'Khai báo sqflite (SQLite nội bộ), fl_chart (Biểu đồ tròn 50-30-20), flutter_riverpod (Quản lý trạng thái Clean Architecture) và intl (Định dạng VNĐ).',
    language: 'yaml',
    code: `name: khoi_s_money
description: Ứng dụng quản lý tài chính cá nhân theo Phiếu Tháng & Quy tắc 50-30-20.
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  # Lưu trữ cơ sở dữ liệu SQLite cục bộ theo từng Sheet tháng
  sqflite: ^2.3.3+1
  path: ^1.9.0
  # Quản lý state theo Clean Architecture
  flutter_riverpod: ^2.5.1
  # Thư viện vẽ Biểu đồ tròn (PieChart) trực quan cho quy tắc 50-30-20
  fl_chart: ^0.68.0
  # Định dạng tiền tệ VNĐ và ngày tháng
  intl: ^0.19.0
  uuid: ^4.4.0
  google_fonts: ^6.2.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0`,
  },
  {
    id: 'sqlite_schema',
    title: '2. Thiết kế Cơ sở dữ liệu SQLite (database_helper.dart)',
    path: 'lib/data/datasources/local/database_helper.dart',
    layer: 'Data Layer (SQLite)',
    description: 'Thiết kế 2 bảng chuẩn hóa: monthly_sheets (Lưu Phiếu Số dư Đầu tháng cho MB, OCB, ACB, Tiền mặt, Nợ tín dụng, Shopee Pay Later) và expense_vouchers (Lưu Phiếu Trừ tiền phân loại 50-30-20).',
    language: 'dart',
    code: `import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('khoi_s_money.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 1,
      onConfigure: (db) async {
        // Bật khóa ngoại để khi xóa Sheet tháng sẽ tự động dọn sạch các Phiếu chi trong tháng
        await db.execute('PRAGMA foreign_keys = ON');
      },
      onCreate: _createDB,
    );
  }

  Future<void> _createDB(Database db, int version) async {
    // BẢNG 1: PHIẾU KHỞI TẠO ĐẦU THÁNG (MONTHLY SHEETS)
    // Mỗi tháng tương ứng 1 bản ghi duy nhất (VD: id = '2026-10')
    await db.execute('''
      CREATE TABLE monthly_sheets (
        id TEXT PRIMARY KEY,               -- Định dạng YYYY-MM (VD: '2026-10')
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        label TEXT NOT NULL,               -- VD: 'Tháng 10/2026'
        mb_initial INTEGER NOT NULL,       -- Số dư đầu tháng Ngân hàng MB (VNĐ)
        ocb_initial INTEGER NOT NULL,      -- Số dư đầu tháng Ngân hàng OCB (VNĐ)
        acb_initial INTEGER NOT NULL,      -- Số dư đầu tháng Ngân hàng ACB (VNĐ)
        cash_initial INTEGER NOT NULL,     -- Số dư đầu tháng Tiền mặt (VNĐ)
        credit_debt_initial INTEGER NOT NULL,    -- Dư nợ Tín dụng đầu tháng (VNĐ)
        spaylater_debt_initial INTEGER NOT NULL, -- Dư nợ Shopee Pay Later đầu tháng (VNĐ)
        rolled_over_from TEXT,             -- Tháng nguồn nếu dùng tính năng Kết chuyển số dư
        note TEXT,
        updated_at TEXT NOT NULL
      )
    ''');

    // BẢNG 2: PHIẾU TRỪ TIỀN TRONG THÁNG (EXPENSE VOUCHERS)
    await db.execute('''
      CREATE TABLE expense_vouchers (
        id TEXT PRIMARY KEY,
        sheet_id TEXT NOT NULL,            -- Tham chiếu tới monthly_sheets.id
        title TEXT NOT NULL,               -- Nội dung chi tiêu
        amount INTEGER NOT NULL,           -- Số tiền trừ (VNĐ)
        category TEXT NOT NULL,            -- 'needs_50' | 'wants_30' | 'savings_debt_20'
        sub_category TEXT NOT NULL,        -- VD: 'Ăn uống', 'Trả nợ Thẻ tín dụng'...
        source_wallet TEXT NOT NULL,       -- 'mb' | 'ocb' | 'acb' | 'cash'
        debt_target TEXT,                  -- 'creditCard' | 'shopeePayLater' | 'savings_fund'
        tx_date TEXT NOT NULL,             -- Ngày tạo phiếu (YYYY-MM-DD)
        note TEXT,
        FOREIGN KEY (sheet_id) REFERENCES monthly_sheets (id) ON DELETE CASCADE
      )
    ''');
  }
}`,
  },
  {
    id: 'domain_entities',
    title: '3. Thực thể Nghiệp vụ & Công thức Tài sản Ròng (monthly_sheet_entity.dart)',
    path: 'lib/domain/entities/monthly_sheet_entity.dart',
    layer: 'Domain Layer (Entities)',
    description: 'Định nghĩa mô hình Sheet Tháng, tự động tính Tổng Tài sản, Tổng Công nợ, Tài sản ròng thực tế và Số dư khả dụng từng ví sau khi trừ các Phiếu chi.',
    language: 'dart',
    code: `enum WalletType { mb, ocb, acb, cash }
enum Rule503020Category { needs50, wants30, savingsDebt20 }
enum DebtTargetType { creditCard, shopeePayLater, savingsFund }

class ExpenseVoucherEntity {
  final String id;
  final String sheetId;
  final String title;
  final int amount;
  final Rule503020Category category;
  final String subCategory;
  final WalletType sourceWallet;
  final DebtTargetType? debtTarget;
  final DateTime date;
  final String? note;

  const ExpenseVoucherEntity({
    required this.id,
    required this.sheetId,
    required this.title,
    required this.amount,
    required this.category,
    required this.subCategory,
    required this.sourceWallet,
    this.debtTarget,
    required this.date,
    this.note,
  });
}

class MonthlySheetEntity {
  final String id; // '2026-10'
  final int month;
  final int year;
  final String label;
  final int mbInitial;
  final int ocbInitial;
  final int acbInitial;
  final int cashInitial;
  final int creditDebtInitial;
  final int spaylaterDebtInitial;
  final List<ExpenseVoucherEntity> vouchers;

  const MonthlySheetEntity({
    required this.id,
    required this.month,
    required this.year,
    required this.label,
    required this.mbInitial,
    required this.ocbInitial,
    required this.acbInitial,
    required this.cashInitial,
    required this.creditDebtInitial,
    required this.spaylaterDebtInitial,
    this.vouchers = const [],
  });

  /// 1. Tổng tài sản đầu tháng = MB + OCB + ACB + Tiền mặt
  int get totalInitialAssets => mbInitial + ocbInitial + acbInitial + cashInitial;

  /// 2. Tổng nợ đầu tháng = Nợ tín dụng + Nợ Shopee Pay Later
  int get totalInitialDebts => creditDebtInitial + spaylaterDebtInitial;

  /// 3. Tài sản ròng đầu tháng = Tổng tài sản - Tổng nợ
  int get initialNetWorth => totalInitialAssets - totalInitialDebts;

  /// 4. Tính số dư thực tế còn lại của từng nguồn tiền sau khi trừ các Phiếu chi
  int currentWalletBalance(WalletType wallet) {
    final initial = switch (wallet) {
      WalletType.mb => mbInitial,
      WalletType.ocb => ocbInitial,
      WalletType.acb => acbInitial,
      WalletType.cash => cashInitial,
    };
    final spent = vouchers
        .where((v) => v.sourceWallet == wallet)
        .fold<int>(0, (sum, v) => sum + v.amount);
    return initial - spent;
  }

  /// 5. Tính dư nợ còn lại sau khi đã tạo Phiếu trả nợ (Nhóm 20%)
  int get remainingCreditDebt {
    final paid = vouchers
        .where((v) => v.debtTarget == DebtTargetType.creditCard)
        .fold<int>(0, (sum, v) => sum + v.amount);
    return (creditDebtInitial - paid).clamp(0, creditDebtInitial);
  }

  int get remainingSpaylaterDebt {
    final paid = vouchers
        .where((v) => v.debtTarget == DebtTargetType.shopeePayLater)
        .fold<int>(0, (sum, v) => sum + v.amount);
    return (spaylaterDebtInitial - paid).clamp(0, spaylaterDebtInitial);
  }
}`,
  },
  {
    id: 'pie_chart_widget',
    title: '4. Biểu đồ Tròn 50-30-20 với fl_chart (rule_pie_chart_card.dart)',
    path: 'lib/presentation/widgets/rule_pie_chart_card.dart',
    layer: 'Presentation Layer (UI & Chart)',
    description: 'Sử dụng thư viện fl_chart để vẽ Biểu đồ tròn (Donut PieChart) hiển thị tỷ lệ % thực tế đã chi theo 3 nhóm 50% Thiết yếu - 30% Cá nhân - 20% Trả nợ/Tiết kiệm.',
    language: 'dart',
    code: `import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../../domain/entities/monthly_sheet_entity.dart';

class RulePieChartCard extends StatelessWidget {
  final MonthlySheetEntity sheet;

  const RulePieChartCard({super.key, required this.sheet});

  @override
  Widget build(BuildContext context) {
    final totalSpent = sheet.vouchers.fold<int>(0, (s, v) => s + v.amount);
    final needsSpent = sheet.vouchers
        .where((v) => v.category == Rule503020Category.needs50)
        .fold<int>(0, (s, v) => s + v.amount);
    final wantsSpent = sheet.vouchers
        .where((v) => v.category == Rule503020Category.wants30)
        .fold<int>(0, (s, v) => s + v.amount);
    final savingsDebtSpent = sheet.vouchers
        .where((v) => v.category == Rule503020Category.savingsDebt20)
        .fold<int>(0, (s, v) => s + v.amount);

    double pct(int val) => totalSpent == 0 ? 0 : (val / totalSpent) * 100;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Tỷ trọng Chi tiêu 50-30-20',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 210,
            child: PieChart(
              PieChartData(
                sectionsSpace: 3,
                centerSpaceRadius: 56,
                sections: [
                  PieChartSectionData(
                    value: needsSpent.toDouble(),
                    color: const Color(0xFF14B8A6), // Xanh ngọc (50% Thiết yếu)
                    title: '\${pct(needsSpent).toStringAsFixed(1)}%',
                    radius: 42,
                    titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  PieChartSectionData(
                    value: wantsSpent.toDouble(),
                    color: const Color(0xFF0EA5E9), // Xanh dương (30% Cá nhân)
                    title: '\${pct(wantsSpent).toStringAsFixed(1)}%',
                    radius: 42,
                    titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  PieChartSectionData(
                    value: savingsDebtSpent.toDouble(),
                    color: const Color(0xFF6366F1), // Indigo (20% Trả nợ/Tích lũy)
                    title: '\${pct(savingsDebtSpent).toStringAsFixed(1)}%',
                    radius: 42,
                    titleStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}`,
  },
  {
    id: 'setup_guide',
    title: '5. Hướng dẫn Tích hợp vào Android Studio / VS Code',
    path: 'README_SETUP.md',
    layer: 'Integration Guide',
    description: 'Các câu lệnh khởi tạo dự án Flutter, phân tách thư mục theo Clean Architecture và chạy trên máy ảo hoặc điện thoại Android.',
    language: 'bash',
    code: `# BƯỚC 1: Khởi tạo dự án Flutter mới với package name chuẩn
flutter create --org vn.khoismoney khoi_s_money
cd khoi_s_money

# BƯỚC 2: Cài đặt các thư viện cốt lõi (SQLite, fl_chart, Riverpod, Intl)
flutter pub add sqflite path flutter_riverpod fl_chart intl uuid google_fonts

# BƯỚC 3: Tạo cấu trúc thư mục Clean Architecture trong lib/
mkdir -p lib/core/theme
mkdir -p lib/core/utils
mkdir -p lib/data/datasources/local
mkdir -p lib/data/models
mkdir -p lib/data/repositories
mkdir -p lib/domain/entities
mkdir -p lib/domain/repositories
mkdir -p lib/domain/usecases
mkdir -p lib/presentation/providers
mkdir -p lib/presentation/screens
mkdir -p lib/presentation/widgets

# BƯỚC 4: Kiểm tra thiết bị Android và chạy ứng dụng
flutter devices
flutter run --release`,
  },
];
