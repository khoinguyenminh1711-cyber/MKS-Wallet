# MKS Wallet — Kế hoạch Nâng cấp Toàn diện (Goals, Analytics & AI Receipt Scanner)

Nâng cấp MKS Wallet từ sổ ghi chép thu chi hàng tháng thành nền tảng quản trị tài chính cá nhân thông minh và tự động hóa cao, kết hợp lộ trình mục tiêu tích lũy, phân tích dòng tiền đa kỳ và trợ lý quét biên lai giao dịch bằng thị giác máy tính Gemini.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Người dùng đã xác nhận giữ lại kế hoạch phát triển bộ 3 tính năng chiến lược (Gợi ý 1 đến 3). Dưới đây là các định hướng kiến trúc quan trọng được thiết lập để đảm bảo hiệu năng và trải nghiệm người dùng liền mạch:

- **Confirmed Decision 1 (Kiến trúc Điều hướng)**: Bổ sung 2 phân hệ chuyên biệt mới vào thanh điều hướng (`ActiveSection`):
  1. **"Mục tiêu & Lộ trình" (Goals & Debt Roadmap)**: Nơi theo dõi tiến độ các hũ tiết kiệm mục tiêu và chiến lược thanh toán dứt điểm nợ.
  2. **"Báo cáo & Xu hướng" (Analytics & Multi-month Trends)**: Phân tích so sánh dữ liệu thực chi, thu nhập và tài sản ròng qua các tháng.
- **Confirmed Decision 2 (Vị trí AI Scanner)**: Trình quét hóa đơn thông minh sẽ được tích hợp ngay tại modal tạo phiếu (cả Phiếu Chi và Phiếu Thu) cùng một nút bấm nổi trên thanh công cụ Quick Actions để người dùng có thể tải/chụp ảnh biên lai giao dịch VietQR, hóa đơn siêu thị, hoặc bill cà phê.
- **Confirmed Decision 3 (Xử lý Server-Side AI)**: Khai thác endpoint `/api/gemini/scan-receipt` trên Node.js backend sử dụng `@google/genai` với model `gemini-3.8-flash` và Structured JSON Output, đảm bảo bảo mật API key và trích xuất thông tin chuẩn xác theo định dạng phiếu của MKS Wallet.

---

### 1. Overview & Core Concept

- **What It Does**: 
  - **Mục tiêu Tiết kiệm & Trả nợ**: Cho phép người dùng đặt các mục tiêu cụ thể (như Quỹ khẩn cấp 6 tháng, Trả hết thẻ tín dụng, Mua laptop, Tích lũy mua nhà). Hệ thống tự động đo lường số dư ví tiết kiệm và số dư nợ thực tế để hiển thị % hoàn thành và ước tính số tháng còn lại dựa trên dòng tiền ròng trung bình.
  - **Phân tích Xu hướng Đa tháng**: Tổng hợp toàn bộ các sổ tháng (`MonthlySheet[]`), trực quan hóa biểu đồ cột/đường so sánh biến động Thu - Chi - Tiết kiệm, đo lường độ lệch chuẩn so với tỷ lệ 50-30-20 mục tiêu, và phát hiện các khoản chi tăng đột biến.
  - **AI Receipt & Invoice Scanner**: Cho phép tải ảnh chụp màn hình chuyển khoản ngân hàng (VietQR / Internet Banking) hoặc hóa đơn giấy. Gemini Vision phân tích và trích xuất: số tiền, thời gian, tên người nhận/cửa hàng, tự động gán nhãn danh mục con và tỷ lệ 50-30-20 tương ứng rồi điền sẵn vào phiếu để người dùng chỉ cần nhấn "Lưu".
- **Target Audience / Persona**: Người đi làm, freelancer hoặc người quản lý tài chính gia đình cần kiểm soát chặt chẽ ngân sách, muốn rút ngắn thời gian nhập liệu thủ công và có cái nhìn dài hạn về tài sản tích lũy.
- **Key Value**: Xóa bỏ rào cản lười ghi chép (nhờ AI scan biên lai 2 giây), giải tỏa áp lực nợ nần qua lộ trình trả nợ minh bạch, và củng cố thói quen tiết kiệm có đích đến.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **Quét Hóa đơn Chuyển khoản (AI Scanner)**:
   - Người dùng vừa chuyển khoản qua app ngân hàng hoặc nhận hóa đơn ăn uống $\rightarrow$ Bấm nút "Quét hóa đơn / Bill" trên giao diện.
   - Kéo thả hoặc chụp ảnh biên lai $\rightarrow$ Trình quét hiển thị hiệu ứng quét tinh tế ($\le 2s$) $\rightarrow$ Form phiếu chi hiện ra với đầy đủ thông tin: Tiêu đề ("Ăn trưa Kichi Kichi"), Số tiền (349.000đ), Phân loại (50% Thiết yếu $\rightarrow$ Ăn uống hàng ngày), Ví nguồn ("Ngân hàng").
   - Người dùng kiểm tra nhanh và nhấn "Tạo phiếu" $\rightarrow$ Dữ liệu ghi tức thì vào sổ tháng và đồng bộ Google Sheets.
2. **Theo dõi Lộ trình Mục tiêu & Trả nợ**:
   - Chuyển sang tab "Mục tiêu & Lộ trình".
   - Xem các thẻ tiến độ trực quan: Ví dụ "Quỹ khẩn cấp: 30.000.000 / 50.000.000đ (60%)", "Dứt nợ Thẻ tín dụng: Đã trả 12.000.000 / 18.000.000đ".
   - Dự báo tự động: "Với tốc độ tiết kiệm 5.000.000đ/tháng hiện tại, bạn sẽ hoàn thành mục tiêu này sau 4 tháng".
3. **Xem Báo cáo Đa tháng (Multi-month Analytics)**:
   - Chuyển sang tab "Báo cáo & Xu hướng".
   - Bộ chọn phạm vi: 3 tháng gần nhất, 6 tháng gần nhất, hoặc Cả năm.
   - Thống kê tỷ lệ tiết kiệm bình quân, so sánh cơ cấu chi phí thực tế giữa các tháng, và danh sách các hạng mục tiêu tốn nhiều tiền nhất.

#### B. Visual Identity & Theme
- **Phong cách Thiết kế**: Phong cách B2B/Fintech hiện đại theo tiêu chuẩn `frontend-design` SaaS: tối giản, thanh lịch, nền tối (`bg-slate-950` / `bg-slate-900`) hoặc sáng tinh tươm (`bg-white` / `bg-slate-50`), đường viền sắc nét 1px (`border-slate-800`), loại bỏ triệt để các hiệu ứng gradient tím hay badge cầu kỳ.
- **Quy tắc Số liệu Tài chính**: 100% số tiền, tỷ lệ % và mốc thời gian áp dụng `font-mono tabular-nums` để các hàng thẳng tắp tuyệt đối.
- **Zero-Pill Discipline**: Metadata ngày tháng và phân loại hiển thị dạng văn bản thanh thoát ngăn cách bằng dấu chấm `·` (ví dụ: `Vietcombank · 24/10/2026 · Nhu cầu thiết yếu`), không bọc các pill màu mè giả lập.

---

### 3. Key Product Decisions & Trade-Offs

- **Quyết định 1: Tích hợp Vision Scanner qua Express Proxy Route**:
  - *Giải pháp*: Xây dựng route `POST /api/gemini/scan-receipt` trên `server.ts` nhận base64 image data và truyền trực tiếp vào `ai.models.generateContent` với model `gemini-3.8-flash`.
  - *Lý do*: Tuyệt đối tuân thủ nguyên tắc không để lộ `GEMINI_API_KEY` ở client, đồng thời tận dụng khả năng nhận diện tiếng Việt cực tốt của model Gemini Flash mới nhất trên các mẫu sao kê ngân hàng nội địa (Techcombank, Vietcombank, MBBank, Momo, VNPay).
  - *Phương án loại trừ*: Không sử dụng thư viện OCR client-side như Tesseract.js vì độ chính xác tiếng Việt kém và không tự động suy luận được danh mục 50-30-20.
- **Quyết định 2: Tận dụng dữ liệu MonthlySheet hiện có để phân tích đa tháng**:
  - *Giải pháp*: Hàm phân tích đa kỳ sẽ duyệt qua mảng `sheets` đã có sẵn trong state của `App.tsx` (và đồng bộ Google Sheets).
  - *Lý do*: Không làm phình to cấu trúc dữ liệu mới, đảm bảo tương thích 100% với các sổ thu chi mà người dùng đã lập từ trước.
- **Quyết định 3: Lưu trữ Mục tiêu Tài chính (Goals Storage)**:
  - *Giải pháp*: Định nghĩa cấu trúc `FinancialGoal` lưu trữ độc lập trong `localStorage` (theo user ID nếu đã đăng nhập) và bổ sung 1 tab sheet `Mục Tiêu` trên Google Sheets khi đồng bộ để bảo toàn dữ liệu liên tục.

---

### 4. Technical Architecture & Data Strategy

#### A. Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                               React SPA                                │
│                                                                        │
│  ┌─────────────────────── Top Bar Navigation ──────────────────────┐  │
│  │ [MKS Wallet]  ·  Tổng quan  ·  Sổ chi tiết  ·  Mục tiêu  ·  Báo cáo │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Active Section Routing                                           │  │
│  │                                                                  │  │
│  │  ├── dashboard:            Dashboard 50-30-20 + Quick Actions    │  │
│  │  ├── expense_vouchers:     Sổ thu chi theo tháng                 │  │
│  │  ├── financial_goals:      [NEW] FinancialGoalsView.tsx          │  │
│  │  │                         - Quỹ khẩn cấp, Mục tiêu mua sắm      │  │
│  │  │                         - Kế hoạch tất toán nợ thẻ            │  │
│  │  └── financial_analytics:  [NEW] FinancialAnalyticsView.tsx      │  │
│  │                            - Biểu đồ xu hướng đa tháng (SVG/Bars) │  │
│  │                            - So sánh cơ cấu chi phí 50-30-20     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────── Modal & Quick Actions ─────────────────────┐  │
│  │ [NEW] ReceiptScannerModal.tsx                                     │  │
│  │  - Kéo thả / Chụp ảnh biên lai                                   │  │
│  │  - Gửi request đến /api/gemini/scan-receipt                      │  │
│  │  - Điền form xác thực và ghi vào ExpenseVoucher / IncomeVoucher  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                 │ (Fetch)                              │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express Backend (server.ts)                     │
│                                                                        │
│  POST /api/gemini/scan-receipt ──► @google/genai (gemini-3.8-flash)     │
│  - Multimodal base64 input         Structured JSON Schema Response     │
│  - Trích xuất: amount, date, title, ruleCategory, subCategory, wallet  │
└────────────────────────────────────────────────────────────────────────┘
```

#### B. Data Model Extensions (`src/types/finance.ts`)

```typescript
export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  category: 'savings' | 'debt_payoff' | 'emergency_fund' | 'purchase';
  linkedWalletKey?: AssetKey; // Tự động đồng bộ số dư nếu liên kết với ví
  linkedDebtKey?: DebtKey;     // Tự động đo lường số dư nợ đã trả
  notes?: string;
  createdAt: string;
}

export interface ReceiptScanResult {
  title: string;
  amount: number;
  date: string;
  voucherType: 'expense' | 'income';
  category?: RuleCategory;
  subCategory?: string;
  suggestedWallet?: string;
  confidence: number;
  merchantName?: string;
}
```

#### C. Implementation Roadmap
- **Bước 1**: Mở rộng types `finance.ts`, thêm schema `FinancialGoal` và `ReceiptScanResult`.
- **Bước 2**: Bổ sung backend proxy route `POST /api/gemini/scan-receipt` trên `server.ts` sử dụng SDK `@google/genai` với prompt trích xuất biên lai chuyên sâu cho thị trường Việt Nam (hỗ trợ đọc QR, số tiền, ngày giờ, nội dung giao dịch).
- **Bước 3**: Xây dựng component `ReceiptScannerModal.tsx` với giao diện kéo thả mượt mà, preview ảnh, loading trạng thái quét trực quan và form xác nhận tự động.
- **Bước 4**: Xây dựng component `FinancialGoalsView.tsx` với thẻ tiến độ thanh lịch, thanh phần trăm hoàn thành, tính toán dự báo thời gian dứt nợ / cán đích quỹ khẩn cấp.
- **Bước 5**: Xây dựng component `FinancialAnalyticsView.tsx` hiển thị biểu đồ xu hướng dòng tiền đa kỳ (so sánh Thu - Chi - Tiết kiệm các tháng, cơ cấu chi tiêu thực tế vs quy tắc 50-30-20).
- **Bước 6**: Tích hợp các tab mới vào thanh điều hướng chính trong `App.tsx`, đảm bảo responsive đầy đủ trên cả desktop 1440px lẫn thiết bị di động, duy trì toàn vẹn tính năng đồng bộ Google Sheets.
