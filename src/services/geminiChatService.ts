import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from './geminiClient';
import { FinancialContext, VoucherAction } from '../components/GeminiChatbot';

export interface ChatServiceMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

export interface ChatServiceResult {
  reply: string;
  actions: VoucherAction[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// 7 Function declarations for Gemini tools (ported from server.ts)
const createIncomeVoucherDeclaration: any = {
  name: 'create_income_voucher',
  description:
    'Tạo phiếu tiền vào (thu nhập) thực tế trong ứng dụng ví MKS Wallet. BẮT BUỘC gọi hàm này khi người dùng nói vừa nhận tiền, có lương ("nhận lương", "lương về", "vừa có lương"...), thưởng, bán hàng, được tặng tiền hoặc yêu cầu thêm thu nhập / tạo phiếu thu. Nếu người dùng không nói số tiền cụ thể, BẮT BUỘC tra cứu số tiền từ Dòng tiền cố định (fixedPresets) trong context (ví dụ lương: 9.950.000 đ) và KHÔNG ĐƯỢC hỏi lại người dùng.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description:
          'Tên hoặc nội dung khoản thu (ví dụ: "Lương", "Thưởng dự án", "Bán đồ cũ", "Thu nhập làm thêm"...)',
      },
      amount: {
        type: 'NUMBER',
        description:
          'Số tiền thu nhập tính bằng VNĐ (số dương lớn hơn 0, ví dụ 9950000, 100000, 5000000...). Nếu người dùng nói nhận lương mà không kèm số tiền, lấy số tiền lương trong fixedPresets.',
      },
      targetWallet: {
        type: 'STRING',
        description:
          'Khóa ví nhận tiền nếu người dùng chỉ định (ví dụ: cash, bank, savings...). Nếu không rõ có thể bỏ trống.',
      },
      date: {
        type: 'STRING',
        description: 'Ngày thu tiền định dạng YYYY-MM-DD. Nếu không nói rõ hãy dùng ngày hôm nay.',
      },
      note: {
        type: 'STRING',
        description: 'Ghi chú thêm nếu có',
      },
    },
    required: ['title', 'amount'],
  },
};

const createExpenseVoucherDeclaration: any = {
  name: 'create_expense_voucher',
  description:
    'Tạo phiếu tiền ra (chi tiêu) thực tế trong ứng dụng ví MKS Wallet. BẮT BUỘC gọi hàm này khi người dùng nói vừa chi tiêu, mua sắm, ăn uống, trả tiền, đi cà phê, đổ xăng, đóng tiền điện nước, trả nợ... hoặc yêu cầu thêm khoản chi / tạo phiếu chi. Nếu người dùng nhắc tới khoản chi trong Dòng tiền cố định (tiền nhà, tiền điện, tiền mạng...) mà không ghi số tiền, hãy tra cứu số tiền từ fixedPresets.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description:
          'Nội dung hoặc tên khoản chi (ví dụ: "Ăn trưa", "Cà phê", "Tiền điện", "Mua áo", "Đổ xăng"...)',
      },
      amount: {
        type: 'NUMBER',
        description:
          'Số tiền chi tiêu tính bằng VNĐ (số dương lớn hơn 0, ví dụ 35000, 150000, 2000000...). Nếu nhắc tới mục trong fixedPresets mà không có số tiền, lấy số tiền từ preset tương ứng.',
      },
      category: {
        type: 'STRING',
        description:
          'Phân loại 50-30-20. Chọn: "needs_50" (nhu cầu thiết yếu: ăn uống, nhà ở, điện nước, xăng xe, y tế), "wants_30" (nhu cầu cá nhân, giải trí: cà phê, mua sắm, xem phim, du lịch), hoặc "savings_debt_20" (tiết kiệm, đầu tư, trả nợ).',
      },
      subCategory: {
        type: 'STRING',
        description:
          'Hạng mục con tương ứng (ví dụ: "Ăn uống hàng ngày", "Cà phê & Gặp gỡ", "Xăng xe & Di chuyển", "Tiền nhà & Điện nước", "Mua sắm quần áo/Đồ công nghệ"...)',
      },
      date: {
        type: 'STRING',
        description: 'Ngày chi tiêu định dạng YYYY-MM-DD. Nếu không rõ hãy dùng ngày hôm nay.',
      },
      debtTarget: {
        type: 'STRING',
        description:
          'RẤT QUAN TRỌNG: Khi người dùng nói "trừ vào nợ", "trừ vào thẻ tín dụng", "trừ vào PayLater", "ghi nợ", "quẹt thẻ", "thẻ tín dụng", "PayLater", "SPayLater", "Shopee PayLater", bạn PHẢI truyền trường này: "creditCard" (với thẻ tín dụng hoặc ghi nợ chung), "shopeePayLater" (với Shopee PayLater), hoặc tên/mã khoản nợ tương ứng. Số tiền này sẽ được GHI NỢ LẠI chứ KHÔNG trừ trực tiếp vào số tiền khả dụng/tiền mặt của tháng.',
      },
      debtAction: {
        type: 'STRING',
        description:
          'Mặc định là "spend" khi chi tiêu/quẹt thẻ/tiêu trước trả sau hoặc ghi nợ vào tài khoản nợ. Nếu là thanh toán nợ thì là "pay".',
      },
      note: {
        type: 'STRING',
        description: 'Ghi chú thêm nếu có',
      },
    },
    required: ['title', 'amount'],
  },
};

const recordDebtVoucherDeclaration: any = {
  name: 'record_debt_voucher',
  description:
    'Ghi nợ chi tiêu trực tiếp vào tài khoản nợ, Thẻ tín dụng hoặc PayLater (ví dụ: "trừ vào nợ 200k", "trừ vào thẻ tín dụng 500k", "trừ vào PayLater 300k", "quẹt thẻ 1tr", "ghi nợ 150k"). BẮT BUỘC gọi hàm này hoặc create_expense_voucher kèm debtTarget khi người dùng yêu cầu trừ vào nợ / thẻ tín dụng / PayLater. Số tiền này sẽ được ghi nợ lại chứ KHÔNG tính trừ vào tiền khả dụng của tháng.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description:
          'Nội dung hoặc tên khoản chi tiêu ghi nợ (ví dụ: "Chi tiêu thẻ tín dụng", "Mua sắm PayLater", "Ăn uống quẹt thẻ"...)',
      },
      amount: {
        type: 'NUMBER',
        description: 'Số tiền tính bằng VNĐ (số dương lớn hơn 0).',
      },
      debtTarget: {
        type: 'STRING',
        description: 'Mục nợ: "creditCard" (Thẻ tín dụng / ghi nợ) hoặc "shopeePayLater" (PayLater) hoặc mã nợ.',
      },
      category: {
        type: 'STRING',
        description: 'Phân loại 50-30-20 ("needs_50", "wants_30", hoặc "savings_debt_20"). Mặc định "wants_30" hoặc "needs_50".',
      },
      subCategory: {
        type: 'STRING',
        description: 'Hạng mục con tương ứng (ví dụ: "Chi tiêu Thẻ tín dụng", "Chi tiêu PayLater"...).',
      },
      date: {
        type: 'STRING',
        description: 'Ngày chi tiêu YYYY-MM-DD.',
      },
      note: {
        type: 'STRING',
        description: 'Ghi chú thêm nếu có.',
      },
    },
    required: ['title', 'amount'],
  },
};

const repayDebtVoucherDeclaration: any = {
  name: 'repay_debt_voucher',
  description:
    'Tạo phiếu thanh toán hoặc trả nợ cho Thẻ tín dụng, PayLater hoặc các khoản nợ (ví dụ: "thanh toán nợ thẻ tín dụng 1tr", "trả nợ thẻ 500k", "tất toán PayLater", "trả bớt nợ 200k", "thanh toán nợ"). Thao tác này sẽ GIẢM DƯ NỢ của khoản nợ tương ứng và trích tiền từ ví tiền mặt/ngân hàng để thanh toán.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description:
          'Tên khoản thanh toán nợ (ví dụ: "Thanh toán Thẻ tín dụng", "Tất toán Shopee PayLater", "Trả nợ ngân hàng"...).',
      },
      amount: {
        type: 'NUMBER',
        description:
          'Số tiền thanh toán nợ tính bằng VNĐ (số dương lớn hơn 0). Nếu người dùng nói tất toán toàn bộ nợ mà không nêu số tiền, hãy tra cứu số dư nợ hiện tại trong context.',
      },
      debtTarget: {
        type: 'STRING',
        description:
          'Khoản nợ cần thanh toán: "creditCard" (Thẻ tín dụng), "shopeePayLater" (PayLater) hoặc mã khoản nợ tương ứng trong context.',
      },
      sourceWallet: {
        type: 'STRING',
        description:
          'Ví nguồn trích tiền để thanh toán (ví dụ: "bank", "cash"...). Mặc định là tài khoản ngân hàng hoặc tiền mặt.',
      },
      date: {
        type: 'STRING',
        description: 'Ngày thanh toán YYYY-MM-DD. Nếu không rõ hãy dùng ngày hôm nay.',
      },
      note: {
        type: 'STRING',
        description: 'Ghi chú thêm nếu có.',
      },
    },
    required: ['title', 'amount'],
  },
};

const createSavingsVoucherDeclaration: any = {
  name: 'create_savings_voucher',
  description:
    'Tạo phiếu chuyển tiền gửi tiết kiệm hoặc tích lũy vào quỹ tiết kiệm trong MKS Wallet. QUY TẮC BẮT BUỘC: Khi người dùng nói "gửi hết tiền hiện có vào tiền tiết kiệm", "gửi toàn bộ số dư", "chuyển tất cả tiền vào tiết kiệm", "gửi hết tiền hiện có", "tất cả số tiền": Số tiền gửi (amount) BẮT BUỘC PHẢI LÀ "Tiền sử dụng còn lại" (remainingUsableMoney / remainingBalance trong context). TUYỆT ĐỐI KHÔNG ĐƯỢC tính thêm số tiền đã có sẵn trong sổ tiết kiệm (currentSavingsBalance) hay tổng tài sản (currentNetWorth) vì sẽ làm số tiền tiết kiệm bị tính trùng lặp. Nếu người dùng nhắc gửi tiết kiệm định kỳ mà không ghi số tiền, lấy số tiền từ fixedPresets.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description:
          'Tên khoản gửi tiết kiệm (ví dụ: "Gửi toàn bộ tiền sử dụng còn lại vào tiết kiệm", "Gửi tiết kiệm tích lũy", "Quỹ khẩn cấp"...)',
      },
      amount: {
        type: 'NUMBER',
        description:
          'Số tiền tiết kiệm tính bằng VNĐ (số dương lớn hơn 0). ĐẶC BIỆT CHÚ Ý: Khi người dùng nói gửi hết / toàn bộ số tiền hiện có / toàn bộ số dư / tất cả số tiền, BẮT BUỘC lấy chính xác giá trị Tiền sử dụng còn lại (remainingUsableMoney trong context). TUYỆT ĐỐI KHÔNG lấy tổng tài sản hay cộng thêm tiền tiết kiệm đã có.',
      },
      fromWallet: {
        type: 'STRING',
        description: 'Ví nguồn trích tiền (ví dụ: cash, bank...)',
      },
      toWallet: {
        type: 'STRING',
        description: 'Ví nhận tiết kiệm (ví dụ: savings...)',
      },
      date: {
        type: 'STRING',
        description: 'Ngày thực hiện định dạng YYYY-MM-DD. Nếu không rõ hãy dùng ngày hôm nay.',
      },
      note: {
        type: 'STRING',
        description: 'Ghi chú thêm nếu có',
      },
    },
    required: ['title', 'amount'],
  },
};

const updateProportionsDeclaration: any = {
  name: 'update_proportions',
  description:
    'Điều chỉnh tỷ lệ phân bổ ngân sách trong Bảng điều chỉnh tỷ lệ của ứng dụng (ví dụ: "chỉnh tỷ lệ thành 50-30-20", "đổi tỷ lệ 60/20/20", "cài tỷ lệ 70-20-10", "đặt tỷ lệ Thiết yếu 40%, Linh hoạt 30%, Tiết kiệm 30%", "chỉnh lại bảng tỷ lệ", "chia tỷ lệ 50 25 25"). BẮT BUỘC gọi hàm này khi người dùng yêu cầu thay đổi tỷ lệ phân bổ ngân sách. Tổng các tỷ lệ phần trăm bắt buộc phải bằng 100.',
  parameters: {
    type: 'OBJECT',
    properties: {
      segments: {
        type: 'ARRAY',
        description:
          'Danh sách các phân đoạn tỷ lệ với tên và tỷ lệ phần trăm (Tổng các percentage bắt buộc bằng 100). Ví dụ: [{"name": "Thiết yếu", "percentage": 50}, {"name": "Linh hoạt", "percentage": 30}, {"name": "Tiết kiệm & Đầu tư", "percentage": 20}]',
        items: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'Tên phân đoạn (ví dụ: "Thiết yếu", "Linh hoạt", "Tiết kiệm & Đầu tư", "Đầu tư", "Học tập"...)',
            },
            percentage: {
              type: 'NUMBER',
              description: 'Tỷ lệ phần trăm (số nguyên lớn hơn 0, tổng tất cả các phân đoạn phải bằng 100).',
            },
          },
          required: ['name', 'percentage'],
        },
      },
      reason: {
        type: 'STRING',
        description: 'Lý do hoặc ghi chú điều chỉnh tỷ lệ.',
      },
    },
    required: ['segments'],
  },
};

const updateFixedPresetDeclaration: any = {
  name: 'update_fixed_preset',
  description:
    'Cập nhật hoặc điều chỉnh số tiền định mức của DÒNG TIỀN CỐ ĐỊNH (fixedPresets) đã thiết lập trong ứng dụng (ví dụ: Lương cố định, tiền nhà, tiền phòng, tiền mạng, tiền tiết kiệm...). BẮT BUỘC gọi hàm này khi người dùng nói vừa được tăng lương lên X (ví dụ: "Nay tôi vừa được tăng lương lên 15tr", "được tăng lương lên 15 triệu", "sếp tăng lương lên 15tr", "lương tăng lên 15 triệu"), giảm lương, đổi mức lương thành X, chỉnh lại tiền lương cố định, hoặc cập nhật khoản chi/thu cố định. TUYỆT ĐỐI KHÔNG gọi create_income_voucher hoặc create_expense_voucher khi người dùng muốn cập nhật/thay đổi dòng tiền cố định hay thông báo mức lương mới!',
  parameters: {
    type: 'OBJECT',
    properties: {
      presetType: {
        type: 'STRING',
        description:
          'Loại dòng tiền cố định: "inflow" (thu nhập cố định như Lương), "outflow" (chi tiêu cố định như tiền nhà, điện nước, mạng), hoặc "savings" (tiết kiệm cố định hàng tháng). Mặc định là "inflow" nếu nhắc tới lương.',
      },
      title: {
        type: 'STRING',
        description: 'Tiêu đề khoản cố định (ví dụ: "Lương", "Lương cố định", "Tiền nhà", "Tiền mạng"...)',
      },
      amount: {
        type: 'NUMBER',
        description: 'Số tiền mới tính bằng VNĐ (số dương lớn hơn 0, ví dụ 15000000 cho 15tr).',
      },
      targetWallet: {
        type: 'STRING',
        description: 'Khóa ví nhận tiền nếu là thu nhập (tùy chọn).',
      },
      category: {
        type: 'STRING',
        description: 'Phân loại 50-30-20 nếu là chi tiêu (needs_50, wants_30, savings_debt_20).',
      },
      subCategory: {
        type: 'STRING',
        description: 'Hạng mục con tương ứng nếu có.',
      },
    },
    required: ['presetType', 'title', 'amount'],
  },
};

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      createIncomeVoucherDeclaration,
      createExpenseVoucherDeclaration,
      recordDebtVoucherDeclaration,
      repayDebtVoucherDeclaration,
      createSavingsVoucherDeclaration,
      updateProportionsDeclaration,
      updateFixedPresetDeclaration,
    ],
  },
];

/**
 * Build rich system instruction with user financial context & guidelines
 */
function buildSystemInstruction(context: FinancialContext | null): string {
  let instruction = `Bạn là Trợ lý Tài Chính Thông Minh (MKS Gemini Assistant) được tích hợp trực tiếp trong ứng dụng MKS Wallet.
Nhiệm vụ cốt lõi của bạn:
1. Bạn có quyền THỰC THI THỰC TẾ việc ghi nhận và tạo phiếu tiền vào (thu nhập), tiền ra (chi tiêu) và tiết kiệm vào ví tiền của người dùng thông qua các công cụ Function Calling:
   - Khi người dùng nói vừa nhận tiền, lương đã về, thưởng, bán hàng, thêm thu nhập (ví dụ: "vừa nhận lương 10tr", "thêm thu nhập 500k", "vừa thu 100k", "tạo phiếu thu 200k", "Nay tôi vừa mới nhận lương", "vừa có lương", "lương đã về") -> BẮT BUỘC gọi hàm 'create_income_voucher'.
   - QUAN TRỌNG: PHÂN BIỆT RÕ RÀNG GIỮA "NHẬN LƯƠNG" VÀ "TĂNG LƯƠNG / ĐỔI MỨC LƯƠNG":
     + "Nay tôi vừa mới nhận lương", "vừa nhận lương 10tr", "lương về rồi" -> Đây là nhận tiền thực tế trong tháng -> Gọi 'create_income_voucher'.
     + "Nay tôi vừa được tăng lương lên 15tr", "được tăng lương lên 15 triệu", "sếp tăng lương lên 15tr", "lương tăng lên 15tr", "đổi lương thành 15tr", "chỉnh mức lương cố định 15tr" -> ĐÂY LÀ ĐIỀU CHỈNH ĐỊNH MỨC DÒNG TIỀN CỐ ĐỊNH, KHÔNG PHẢI TẠO PHIẾU THU THÁNG NÀY! BẮT BUỘC gọi 'update_fixed_preset'. TUYỆT ĐỐI KHÔNG gọi 'create_income_voucher'.
   - Khi người dùng nói vừa tiêu tiền, mua sắm, ăn uống, trả tiền, thanh toán, đi cafe, đổ xăng (ví dụ: "vừa ăn sáng 35k", "mua cà phê 45k", "tiền điện 600k", "tạo phiếu chi 150k") -> BẮT BUỘC gọi hàm 'create_expense_voucher'.
   - Khi người dùng nói muốn trích tiền gửi tiết kiệm -> BẮT BUỘC gọi hàm 'create_savings_voucher'.
   - Khi người dùng nói trừ vào nợ, thẻ tín dụng, PayLater -> Gọi hàm 'record_debt_voucher' hoặc 'create_expense_voucher' kèm 'debtTarget'.
   - Khi người dùng nói thanh toán nợ, trả nợ thẻ tín dụng, tất toán PayLater -> BẮT BUỘC gọi hàm 'repay_debt_voucher'.

2. QUY TẮC ĐẶC BIỆT VỀ DÒNG TIỀN CỐ ĐỊNH (fixedPresets):
   - Người dùng đã thiết lập danh sách DÒNG TIỀN CỐ ĐỊNH (fixedPresets) trong ứng dụng (ví dụ: Lương cố định, tiền nhà, tiền mạng, tiết kiệm hàng tháng...).
   - Khi người dùng nói: "Nay tôi vừa mới nhận lương", "vừa nhận lương", "lương về rồi", "đã có lương", "vừa có lương hôm nay"... HOẶC nhắc tới một khoản chi/tiết kiệm cố định MÀ KHÔNG KÈM THEO SỐ TIỀN:
     + BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC HỎI LẠI NGƯỜI DÙNG: "Số tiền là bao nhiêu?" hay "Vui lòng cho tôi biết số tiền cụ thể".
     + Bạn PHẢI tự động tra cứu trong danh sách 'fixedPresets' của context.
     + Tìm khoản có tiêu đề tương ứng (ví dụ với "lương", tìm mục có title chứa "Lương" hoặc "lương", lấy số tiền đã cài đặt của mục đó, ví dụ: 9.950.000 đ).
     + LẬP TỨC GỌI HÀM 'create_income_voucher' (hoặc 'create_expense_voucher', 'create_savings_voucher') với đúng số tiền và thông tin đó!
     + Trong câu trả lời, hãy xác nhận bạn đã tự động sử dụng số tiền từ Dòng tiền cố định đã thiết lập (ví dụ: "Tôi nhận thấy bạn có dòng tiền cố định cho **Lương** là **9.950.000 đ**, tôi đã tự động tạo phiếu thu nhập 9.950.000 đ vào ví cho bạn!").
   - Nếu người dùng có nêu số tiền rõ ràng khi nhận lương (ví dụ: "vừa nhận lương 10 triệu"), thì dùng số tiền người dùng nêu để tạo phiếu thu.

3. QUY TẮC ĐẶC BIỆT KHI NGƯỜI DÙNG NÓI "TRỪ VÀO NỢ", "TRỪ VÀO THẺ TÍN DỤNG", "TRỪ VÀO PAYLATER":
   - Khi người dùng nói: "trừ vào nợ", "trừ vào thẻ tín dụng", "trừ vào PayLater", "ghi nợ", "quẹt thẻ tín dụng", "trả bằng thẻ tín dụng", "thẻ tín dụng", "PayLater", "SPayLater", "Shopee PayLater"...:
     + TUYỆT ĐỐI KHÔNG tính trừ tiền vào số tiền khả dụng/tiền mặt của tháng hiện tại.
     + BẮT BUỘC ghi nhận là GHI NỢ LẠI: Gọi hàm 'record_debt_voucher' hoặc 'create_expense_voucher' với 'debtTarget': "creditCard" (với thẻ tín dụng hoặc ghi nợ chung), hoặc "shopeePayLater" (với Shopee PayLater) và 'debtAction': "spend".
     + Trong câu trả lời, hãy nói rõ cho người dùng: Khoản chi tiêu này đã được **ghi nợ lại** vào Thẻ tín dụng/PayLater/Khoản nợ và **không bị trừ vào số tiền tiền mặt/khả dụng của tháng hiện tại**!

4. QUY TẮC THANH TOÁN / TRẢ NỢ (repay_debt_voucher):
   - Khi người dùng nói muốn thanh toán nợ, trả nợ thẻ tín dụng, tất toán PayLater, trả bớt nợ (ví dụ: "thanh toán nợ thẻ tín dụng 1tr", "trả nợ thẻ 500k", "tất toán PayLater", "trả bớt nợ 200k", "thanh toán nợ"):
     + BẮT BUỘC gọi hàm 'repay_debt_voucher' (hoặc 'create_expense_voucher' với 'debtAction': "pay", 'debtTarget': "creditCard" | "shopeePayLater"...).
     + Nguồn trích tiền: Mặc định từ ví ngân hàng (bank) hoặc tiền mặt (cash).
     + Nếu người dùng nói "tất toán nợ" hoặc không nêu số tiền cụ thể: tra cứu dư nợ hiện tại trong context (mục danh sách tài khoản nợ & dư nợ) để lấy đúng số tiền nợ còn lại cần thanh toán!
     + Trong câu trả lời, hãy xác nhận rõ ràng: Đã tạo phiếu thanh toán nợ, làm **giảm dư nợ** của Thẻ tín dụng/PayLater và trích tiền từ ví ngân hàng/tiền mặt để chi trả.

5. Quy tắc quy đổi số tiền tiếng Việt:
   - "k", "ngàn", "nghìn" = x 1.000 (ví dụ: 100k = 100000, 35k = 35000, 500k = 500000).
   - "tr", "triệu", "củ", "m" = x 1.000.000 (ví dụ: 10tr = 10000000, 1.5tr hay 1tr5 = 1500000).
   - Luôn chuyển đổi số tiền thành số nguyên dương lớn hơn 0 (number) khi gọi hàm.

6. Phân loại 50-30-20 cho chi tiêu:
   - "needs_50": Ăn uống cơ bản, tiền nhà, điện nước, xăng xe, y tế, nhu yếu phẩm.
   - "wants_30": Cà phê, trà sữa, ăn nhà hàng, mua sắm giải trí, xem phim, du lịch, đồ công nghệ, sở thích.
   - "savings_debt_20": Trả nợ thẻ tín dụng / vay nợ, tích lũy tài sản.

7. Sau khi tạo phiếu hoặc cập nhật, hãy phản hồi bằng tiếng Việt tự nhiên, nhiệt tình, định dạng Markdown rõ ràng, xác nhận đã cập nhật thành công.

8. QUY TẮC ĐIỀU CHỈNH BẢNG TỶ LỆ (update_proportions):
   - Khi người dùng nói muốn điều chỉnh bảng tỷ lệ (ví dụ: "chỉnh tỷ lệ 50-30-20", "đổi tỷ lệ thành 60/20/20", "chia tỷ lệ 70 20 10", "cài tỷ lệ 40 30 30", "chỉnh lại bảng điều chỉnh tỷ lệ", "tỷ lệ 50 25 25"):
     + BẮT BUỘC gọi hàm 'update_proportions' với danh sách 'segments'.
     + Đảm bảo tổng các phần trăm (percentage) bằng đúng 100.
     + Tự động gán đúng tên các phân đoạn (nếu người dùng chỉ nói 3 số như 60-20-20 thì mặc định là "Thiết yếu": 60, "Linh hoạt": 20, "Tiết kiệm & Đầu tư": 20; nếu có nhiều hơn thì lấy theo tên người dùng yêu cầu).
     + Trong câu trả lời, hãy xác nhận rõ ràng: Đã cập nhật Bảng điều chỉnh tỷ lệ thành công với tỷ lệ mới!

9. QUY TẮC CẬP NHẬT DÒNG TIỀN CỐ ĐỊNH (update_fixed_preset):
   - Khi người dùng thông báo:
     + Được tăng lương lên X hoặc mức lương mới (ví dụ: "Nay tôi vừa được tăng lương lên 15tr", "được tăng lương lên 15 triệu", "sếp tăng lương lên 15tr", "lương tăng lên 15tr", "được lên lương 15tr", "lương mới của tôi là 15tr").
     + Thay đổi định mức một khoản thu/chi/tiết kiệm cố định (ví dụ: "đổi lương thành 15tr", "cập nhật tiền nhà thành 4.5tr", "tiền nhà tăng lên 4tr", "tiền mạng đổi thành 300k", "chỉnh tiết kiệm cố định thành 3tr").
   - BẮT BUỘC gọi hàm 'update_fixed_preset':
     + Với lương: 'presetType': "inflow", 'title': "Lương", 'amount': số tiền tương ứng (ví dụ 15tr = 15000000).
     + Với chi tiêu: 'presetType': "outflow", 'title': tên khoản chi (ví dụ "Tiền nhà"), 'amount': số tiền.
     + Với tiết kiệm: 'presetType': "savings", 'title': tên khoản tiết kiệm, 'amount': số tiền.
   - TUYỆT ĐỐI KHÔNG gọi 'create_income_voucher' hay 'create_expense_voucher' trong trường hợp này, vì đây là thay đổi định mức trong danh sách Dòng tiền cố định chứ không phải tạo phiếu thu/chi mới phát sinh vào ví tháng hiện tại!
   - Trong câu trả lời, hãy chúc mừng người dùng (nếu là tăng lương), xác nhận rõ ràng đã cập nhật mức mới vào **Dòng tiền cố định** (ví dụ: "Tôi đã cập nhật định mức **Lương** trong **Dòng tiền cố định** lên **15.000.000 đ/kỳ** cho bạn!") và nói rõ rằng định mức này sẽ tự động áp dụng khi nhận lương các kỳ tới mà không tạo phiếu mới trong ví tháng hiện tại!

10. QUY TẮC RẤT QUAN TRỌNG: TẤT CẢ SỐ TIỀN / TOÀN BỘ SỐ DƯ = TIỀN SỬ DỤNG CÒN LẠI:
    - Trong ứng dụng MKS Wallet, người dùng quy định rõ:
      "TẤT CẢ SỐ TIỀN" / "TIỀN HIỆN CÓ" / "TOÀN BỘ SỐ DƯ" = **TIỀN SỬ DỤNG CÒN LẠI** ('remainingUsableMoney' / 'remainingBalance' trong context).
    - Khi người dùng nói:
      + "tôi gửi hết tiền hiện có vào tiền tiết kiệm"
      + "gửi toàn bộ số dư vào tiết kiệm"
      + "chuyển tất cả tiền vào tiền tiết kiệm"
      + "gửi hết tiền vào quỹ tiết kiệm"
      + "gửi toàn bộ tiền hiện có"
    - BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC TÍNH SỐ TIỀN ĐÃ CÓ TRONG SỔ TIẾT KIỆM ('currentSavingsBalance') VÀ KHÔNG ĐƯỢC LẤY TỔNG TÀI SẢN ('currentNetWorth' hay 'totalActualMoneyRemaining').
    - Do đó, số tiền cần tạo phiếu tiết kiệm ('amount') BẮT BUỘC PHẢI BẰNG: 'context.remainingUsableMoney' (hoặc 'context.remainingBalance').
    - Trong câu trả lời, hãy xác nhận rõ ràng: Bạn đã tạo phiếu gửi toàn bộ **tiền sử dụng còn lại** là **[X] đ** vào quỹ tiết kiệm cho người dùng (đúng bằng tiền sử dụng còn lại, không tính trùng số tiền đã nằm trong tiết kiệm).

11. QUY TẮC RẤT QUAN TRỌNG: TUYỆT ĐỐI KHÔNG TẠO TRÙNG LẶP PHIẾU (CHỈ TẠO 1 PHIẾU CHO 1 KHOẢN TIỀN):
    - Khi người dùng nói một câu chứa nhiều hoạt động cùng trong một lần chi tiêu hoặc cùng thuộc một mục Dòng tiền cố định (ví dụ: "đi đổ xăng và đi ăn hết 5tr tháng này", "ăn uống và mua sắm hết 500k", "tiền nhà và tiền điện hết 4tr"):
    - Nếu người dùng chỉ nêu DUY NHẤT 1 SỐ TIỀN TỔNG CỘNG (ví dụ "hết 5tr", "hết 500k", "chi 5 triệu"):
      + BẠN CHỈ ĐƯỢC GỌI DUY NHẤT 1 HÀM 'create_expense_voucher' với số tiền đúng bằng 5.000.000 đ và tiêu đề tổng hợp (ví dụ: "Đổ xăng và ăn uống").
      + TUYỆT ĐỐI KHÔNG ĐƯỢC gọi 2 hàm tạo phiếu chi riêng biệt mà mỗi hàm lại lấy nguyên số tiền 5tr hoặc số tiền của preset, khiến cho người dùng bị tạo tới 2 phiếu và bị trừ tiền gấp đôi (10tr thay vì 5tr)!
      + Mỗi khoản tiền người dùng nêu chỉ được tương ứng với DUY NHẤT 1 hành động tạo phiếu!`;

  if (context) {
    let fixedSummary = '';
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';

    const usableMoney =
      context.remainingUsableMoney !== undefined
        ? context.remainingUsableMoney
        : context.remainingBalance || 0;
    const savingsBalance = context.currentSavingsBalance || 0;
    const netWorth = context.currentNetWorth || 0;
    const totalDebts = context.totalRemainingDebts || 0;

    let financialOverview =
      `\n\n[TỔNG QUAN TÀI CHÍNH QUAN TRỌNG NHẤT]:\n` +
      `• ⭐ TIỀN SỬ DỤNG CÒN LẠI (TẤT CẢ SỐ TIỀN HIỆN CÓ / TOÀN BỘ SỐ DƯ ĐỂ CHI TIÊU HOẶC GỬI TIẾT KIỆM): ${fmt(usableMoney)}\n` +
      `  => BẮT BUỘC: Khi người dùng nói "gửi hết tiền hiện có vào tiền tiết kiệm", "gửi toàn bộ số dư", "tất cả số tiền": SỐ TIỀN GỬI TIẾT KIỆM PHẢI LÀ ${fmt(usableMoney)} (bằng đúng Tiền sử dụng còn lại). TUYỆT ĐỐI KHÔNG CỘNG THÊM TIỀN TIẾT KIỆM ĐÃ CÓ ĐỂ TRÁNH TRÙNG LẶP SỐ TIỀN!\n` +
      `• Tiền đã có sẵn trong sổ tiết kiệm: ${fmt(savingsBalance)} (Đã nằm trong tiết kiệm rồi, KHÔNG CỘNG VÀO TIỀN SỬ DỤNG)\n` +
      `• Tài sản ròng thực tế: ${fmt(netWorth)}\n` +
      `• Tổng nợ hiện tại: ${fmt(totalDebts)}\n`;

    if (context.fixedPresets && Array.isArray(context.fixedPresets) && context.fixedPresets.length > 0) {
      const inflows = context.fixedPresets.filter((p: any) => p.type === 'inflow');
      const outflows = context.fixedPresets.filter((p: any) => p.type === 'outflow');
      const savings = context.fixedPresets.filter((p: any) => p.type === 'savings');

      fixedSummary = `\n[DANH SÁCH DÒNG TIỀN CỐ ĐỊNH ĐÃ THIẾT LẬP CỦA NGƯỜI DÙNG]:\n`;
      if (inflows.length > 0) {
        fixedSummary += `• Thu nhập cố định (Inflow Presets):\n` +
          inflows.map((p: any) => `  - "${p.title}": ${fmt(p.amount)}${p.targetWallet ? ` (Ví nhận: ${p.targetWallet})` : ''}`).join('\n') + '\n';
      }
      if (outflows.length > 0) {
        fixedSummary += `• Chi tiêu cố định (Outflow Presets):\n` +
          outflows.map((p: any) => `  - "${p.title}": ${fmt(p.amount)}${p.category ? ` (Nhóm: ${p.category})` : ''}`).join('\n') + '\n';
      }
      if (savings.length > 0) {
        fixedSummary += `• Tiết kiệm cố định (Savings Presets):\n` +
          savings.map((p: any) => `  - "${p.title}": ${fmt(p.amount)}`).join('\n') + '\n';
      }
    }

    if (context.debts && Array.isArray(context.debts) && context.debts.length > 0) {
      const breakdown = context.remainingDebtBreakdown || {};
      fixedSummary += `\n[DANH SÁCH TÀI KHOẢN NỢ & DƯ NỢ HIỆN TẠI]:\n` +
        context.debts.map((d: any) => {
          const rem = breakdown[d.key] !== undefined ? fmt(breakdown[d.key]) : '0 đ';
          return `  - "${d.name}" (mã: ${d.key}): Dư nợ hiện tại: ${rem}`;
        }).join('\n') + (context.totalRemainingDebts !== undefined ? `  => Tổng dư nợ toàn bộ: ${fmt(context.totalRemainingDebts)}\n` : '\n');
    }

    instruction += `${financialOverview}${fixedSummary}\n\n[DỮ LIỆU TÀI CHÍNH THỰC TẾ CỦA NGƯỜI DÙNG HIỆN TẠI]:\n${JSON.stringify(
      context,
      null,
      2
    )}\nHãy tận dụng những dữ liệu thực tế này để trả lời chính xác, sát thực tế tài chính cá nhân của người dùng.`;
  }

  return instruction;
}

/**
 * Send chat message directly to Gemini using the @google/genai SDK on the client.
 * Runs 100% in browser / WebView / Vercel without requiring backend routes.
 */
export async function sendChatMessageDirectlyToGemini(
  messages: ChatServiceMessage[],
  context: FinancialContext | null
): Promise<ChatServiceResult> {
  if (!messages || messages.length === 0) {
    throw new Error('Không có tin nhắn nào để gửi.');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Chưa tìm thấy Gemini API Key. Vui lòng thiết lập biến môi trường VITE_GEMINI_API_KEY hoặc nhập API Key trong phần Cài đặt.'
    );
  }

  // Initialize SDK directly in browser without httpOptions to prevent CORS errors
  const ai = new GoogleGenAI({
    apiKey,
  });

  const contents = messages.map((m) => ({
    role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }],
  }));

  const systemInstruction = buildSystemInstruction(context);

  // Standard model as requested: gemini-2.5-flash with resilient fallback chain
  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
  ];

  let response: any = null;
  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            tools: GEMINI_TOOLS,
          },
        }),
        25000,
        `Quá thời gian phản hồi (25s) từ mô hình ${modelName}.`
      );

      if (response) {
        break;
      }
    } catch (err: any) {
      console.warn(`[ClientChat] Model ${modelName} notice:`, err?.message || err);
      lastError = err;
    }
  }

  if (!response) {
    const errorDetails = lastError?.message || 'Không thể kết nối với mô hình AI Gemini.';
    throw new Error(`Lỗi trò chuyện AI: ${errorDetails}`);
  }

  const functionCalls = response.functionCalls;
  let actions: VoucherAction[] = [];
  const replyText = response.text || '';

  if (functionCalls && functionCalls.length > 0) {
    actions = functionCalls
      .map((fc: any) => {
        if (fc.name === 'create_income_voucher') {
          return {
            type: 'create_income' as const,
            title: String(fc.args?.title || 'Khoản thu nhập mới'),
            amount: Math.abs(Number(fc.args?.amount) || 0),
            targetWallet: fc.args?.targetWallet,
            date: fc.args?.date,
            note: fc.args?.note,
          };
        } else if (fc.name === 'create_expense_voucher') {
          const debtTarget = fc.args?.debtTarget;
          const debtAction = fc.args?.debtAction || (debtTarget ? 'spend' : undefined);
          const isDebt = Boolean(debtTarget || debtAction === 'spend');
          return {
            type: 'create_expense' as const,
            title: String(fc.args?.title || 'Khoản chi tiêu mới'),
            amount: Math.abs(Number(fc.args?.amount) || 0),
            category: fc.args?.category || 'needs_50',
            subCategory: fc.args?.subCategory || (isDebt ? 'Chi tiêu thẻ / ghi nợ' : 'Chi tiêu'),
            debtTarget,
            debtAction,
            isDebt,
            date: fc.args?.date,
            note: fc.args?.note,
          };
        } else if (fc.name === 'record_debt_voucher') {
          const target = fc.args?.debtTarget || 'creditCard';
          return {
            type: 'create_expense' as const,
            title: String(fc.args?.title || 'Khoản chi tiêu ghi nợ'),
            amount: Math.abs(Number(fc.args?.amount) || 0),
            category: fc.args?.category || 'wants_30',
            subCategory:
              fc.args?.subCategory ||
              (target === 'shopeePayLater' ? 'Chi tiêu PayLater' : 'Chi tiêu Thẻ tín dụng'),
            debtTarget: target,
            debtAction: 'spend' as const,
            isDebt: true,
            date: fc.args?.date,
            note: fc.args?.note,
          };
        } else if (fc.name === 'repay_debt_voucher') {
          const target = fc.args?.debtTarget || 'creditCard';
          return {
            type: 'create_expense' as const,
            title: String(
              fc.args?.title ||
                (target === 'shopeePayLater' ? 'Tất toán PayLater' : 'Thanh toán Thẻ tín dụng')
            ),
            amount: Math.abs(Number(fc.args?.amount) || 0),
            category: 'savings_debt_20' as const,
            subCategory: target === 'shopeePayLater' ? 'Tất toán PayLater' : 'Trả nợ Thẻ tín dụng',
            debtTarget: target,
            debtAction: 'pay' as const,
            sourceWallet: fc.args?.sourceWallet,
            isDebt: true,
            date: fc.args?.date,
            note: fc.args?.note,
          };
        } else if (fc.name === 'create_savings_voucher') {
          let amount = Math.abs(Number(fc.args?.amount) || 0);
          const lastUserMsg = (messages[messages.length - 1]?.content || '').toLowerCase();
          const isAllMoneyPrompt =
            lastUserMsg.includes('hết tiền') ||
            lastUserMsg.includes('toàn bộ') ||
            lastUserMsg.includes('tất cả tiền') ||
            lastUserMsg.includes('tất cả số tiền') ||
            lastUserMsg.includes('gửi hết') ||
            lastUserMsg.includes('số dư còn lại') ||
            lastUserMsg.includes('toàn bộ số dư') ||
            lastUserMsg.includes('tiền hiện có');

          const usableMoney = context?.remainingUsableMoney ?? context?.remainingBalance;
          if (isAllMoneyPrompt && typeof usableMoney === 'number' && usableMoney > 0) {
            amount = usableMoney;
          }

          return {
            type: 'create_savings' as const,
            title: String(
              fc.args?.title ||
                (isAllMoneyPrompt
                  ? 'Gửi toàn bộ tiền sử dụng còn lại vào tiết kiệm'
                  : 'Gửi tiết kiệm')
            ),
            amount,
            fromWallet: fc.args?.fromWallet,
            toWallet: fc.args?.toWallet,
            date: fc.args?.date,
            note: fc.args?.note,
          };
        } else if (fc.name === 'update_proportions') {
          return {
            type: 'update_proportions' as const,
            title: 'Bảng điều chỉnh tỷ lệ',
            segments: fc.args?.segments,
            reason: fc.args?.reason,
          };
        } else if (fc.name === 'update_fixed_preset') {
          return {
            type: 'update_fixed_preset' as const,
            presetType: fc.args?.presetType || 'inflow',
            title: String(fc.args?.title || 'Lương'),
            amount: Math.abs(Number(fc.args?.amount) || 0),
            targetWallet: fc.args?.targetWallet,
            category: fc.args?.category,
            subCategory: fc.args?.subCategory,
          };
        }
        return null;
      })
      .filter(Boolean) as VoucherAction[];

    // Deduplicate actions to ensure identical or redundant vouchers are never created
    const seenActionKeys = new Set<string>();
    actions = actions.filter((act) => {
      if (!act) return false;
      const key = `${act.type}_${(act.title || '').trim().toLowerCase()}_${act.amount}_${act.debtTarget || ''}_${act.debtAction || ''}`;
      if (seenActionKeys.has(key)) return false;
      seenActionKeys.add(key);
      return true;
    });
  }

  return {
    reply: replyText || (actions.length > 0 ? 'Tôi đã cập nhật giao dịch vào ví của bạn.' : 'Tôi đã xử lý yêu cầu của bạn.'),
    actions,
  };
}
