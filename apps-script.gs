/**
 * 商周 AI 能力調查問卷 — Google Apps Script 後端
 *
 * 部署方式：
 * 1. 在 Google Drive 新建（或沿用）一個 Google Sheet
 * 2. 開啟試算表 → 擴充功能 → Apps Script
 * 3. 把這整段程式碼貼進去，存檔
 * 4. 點右上角「部署」→ 管理部署作業 → 編輯 → 新版本 → 部署
 * 5. 部署後拿到 Web App URL（https://script.google.com/macros/s/.../exec）
 * 6. 把 URL 貼到 script.js 的 APPS_SCRIPT_URL 變數
 *
 * 注意：因應問卷改版（v3.6 → workshop 暖身版），表頭結構改變。
 *      第一次部署前請先把 Sheet 的「評測結果」分頁刪除，新版會自動建立新表頭。
 */

const SHEET_NAME = '評測結果';

const HEADERS = [
  'timestamp',
  'version',
  'A1_姓名',
  'A2_部門',
  'A3_職稱',
  'Q1_使用頻率',
  'Q2_常用工具',
  'Q3_最常使用內容',
  'D1_最大困擾',
  'D2_期待幫助',
  'L1_熟練度', 'L1_工具',
  'L2_熟練度', 'L2_工具',
  'L3_熟練度', 'L3_工具',
  'L4_熟練度', 'L4_工具',
  'L5_熟練度', 'L5_工具',
  'L6_熟練度', 'L6_工具',
];

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

function doGet() {
  return ContentService
    .createTextOutput('商周 AI 能力調查問卷後端運作中。請用 POST 送資料。')
    .setMimeType(ContentService.MimeType.TEXT);
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#c8161e')
      .setFontColor('#ffffff');
  }
  return sheet;
}
