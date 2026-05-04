/**
 * 商周 AI 即戰力評測 — Google Apps Script 後端
 *
 * 部署方式：
 * 1. 在 Google Drive 新建一個 Google Sheet
 * 2. 開啟試算表 → 擴充功能 → Apps Script
 * 3. 把這整段程式碼貼進去，存檔
 * 4. 點右上角「部署」→ 新增部署作業 → 類型選「網頁應用程式」
 *    - 執行身份：我
 *    - 誰可以存取：所有人
 * 5. 部署後拿到 Web App URL（https://script.google.com/macros/s/.../exec）
 * 6. 把 URL 貼到 assessment/script.js 的 APPS_SCRIPT_URL 變數
 */

// ====== 設定區 ======
const SHEET_NAME = '評測結果';

// 欄位順序（必須與 script.js buildPayload 對應）
const HEADERS = [
  'timestamp',
  'A1_部門',
  'A2_工作性質',
  'A3_AI工具',
  'A4_耗時階段',
  'B1_使用頻率',
  'B2_主要用途',
  'B3_使用方式',
  'B4_自評',
  'B5_遇問題處理',
  'B6_進階功能',
  'C_D1_指令設計',
  'C_D2_數據應用',
  'C_D3_工具選擇',
  'C_D4_流程設計',
  'C_D5_協作委派',
  'C_D6_風險意識',
  'C_總分',
  '層次',
  'Type',
  '認知差距',
  'D1_最耗時3件',
  'D2_最想省',
  'D3_顧慮',
  'D4_開放填答',
  'raw_answers',
];

// ====== 接收 POST ======
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();
    const row = HEADERS.map(h => payload[h] !== undefined ? payload[h] : '');
    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ====== 健康檢查（部署後可在瀏覽器打開 URL 測試）======
function doGet() {
  return ContentService
    .createTextOutput('商周 AI 評測後端運作中。請用 POST 送資料。')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ====== 取得或建立工作表 ======
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1d4ed8')
      .setFontColor('#ffffff');
  }
  return sheet;
}
