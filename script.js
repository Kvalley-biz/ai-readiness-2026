/* ============================================================
   商周 AI 即戰力評測 — Frontend Logic
   - 表單驗證
   - 計分（六維 + L1–L6 + Type A/B/C）
   - 即時報告 + Chart.js 雷達圖
   - 送資料到 Google Apps Script
   ============================================================ */

// ====== 設定區 ======
// 部署 Apps Script 後把 Web App URL 貼這裡
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_aG4Ad74r2pASZfnvQ49zm1xu7r3fj8zI8R276d4Xw_TqECTwHOOZY9dW3dQ8y-63iQ/exec';

// ====== 答案 KEY（v3.2 — Jimmy 18 點 + LLM 整合 / MCP / Skills 補題 2026-05-07） ======
const ANSWER_KEY = {
  Q01:'B', Q02:'C', Q03:'D', Q04:'A', Q05:'D',
  Q06:'D', Q07:'A', Q08:'B', Q09:'C', Q10:'D',
  Q11:'B', Q12:'B', Q13:'A', Q14:'A', Q15:'B', // Q11 換 Gemini 整合 (B); Q13 換 Forms→PPT (A)
  Q16:'A', Q17:'D', Q18:'B', Q19:'C', Q20:'C',
  Q21:'C', Q22:'C', Q23:'A', Q24:'B', Q25:'B', // Q24 換 Skills (B); Q25 換 MCP (B)
  Q26:'B', Q27:'B', Q28:'A', Q29:'D', Q30:'C',
};

// ====== 六維對應 ======
const DIMENSIONS = [
  { code:'D1', label:'AI 指令設計', qs:['Q01','Q02','Q03','Q04','Q05'] },
  { code:'D2', label:'AI 數據應用', qs:['Q06','Q07','Q08','Q09','Q10'] },
  { code:'D3', label:'AI 工具選擇', qs:['Q11','Q12','Q13','Q14','Q15'] },
  { code:'D4', label:'AI 流程設計', qs:['Q16','Q17','Q18','Q19','Q20'] },
  { code:'D5', label:'AI 協作委派', qs:['Q21','Q22','Q23','Q24','Q25'] },
  { code:'D6', label:'AI 風險意識', qs:['Q26','Q27','Q28','Q29','Q30'] },
];

// ====== L1–L6 層次定義 ======
const LEVELS = [
  { min:0,  max:5,  code:'L1', label:'會問',    desc:'你知道怎麼向 AI 提問，這是所有應用的起點。下一步是學會把問題拆解得更具體。' },
  { min:6,  max:10, code:'L2', label:'會拆',    desc:'你能讓 AI 幫你分析資料。下一步是學會給 AI 一個比較框架，讓分析更有根據。' },
  { min:11, max:15, code:'L3', label:'會串',    desc:'你能串接多個工具完成複雜任務，包括讓 AI 幫你生成可執行的程式腳本。下一步是設計可重複使用的流程。' },
  { min:16, max:20, code:'L4', label:'會設計',  desc:'你已能設計 AI 工作流與工具鏈。下一步是把驗證過的流程自動化。' },
  { min:21, max:25, code:'L5', label:'會自動化', desc:'你能建立自動觸發機制，讓重複任務在背景自動完成。下一步是協調多個 Agent 協同運作。' },
  { min:26, max:30, code:'L6', label:'會指揮',  desc:'你能設計並指揮 AI Agent 系統。你的角色已從「執行者」轉為「系統設計師」。' },
];

// 進階工具（Type B 偵測用）
const ADVANCED_B6 = [
  'Claude Projects或Gemini Gems',
  'Make或Zapier或n8n',
  'Prompt模板或系統提示詞',
  'NotebookLM',
  'AI Agent工具',
];

// ====== DOM Refs ======
const form = document.getElementById('assessment-form');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');
const reportEl = document.getElementById('report');

// ====== 互動：複選上限、互斥選項 ======
form.addEventListener('change', (e) => {
  const t = e.target;
  if (t.type !== 'checkbox') return;

  const name = t.name;
  const group = form.querySelectorAll(`input[type="checkbox"][name="${name}"]`);

  // 處理「以上都沒用過 / 沒在用 AI / 沒有使用任何 AI 工具」這類互斥選項
  if (t.dataset.exclusive === 'true' && t.checked) {
    group.forEach(cb => { if (cb !== t) cb.checked = false; });
  } else if (t.checked) {
    // 一旦勾了其他選項，互斥選項要被取消
    group.forEach(cb => { if (cb.dataset.exclusive === 'true') cb.checked = false; });
  }

  // 處理 max 上限
  const max = parseInt(t.dataset.max, 10);
  if (max && t.checked) {
    const checkedCount = Array.from(group).filter(cb => cb.checked).length;
    if (checkedCount > max) {
      t.checked = false;
      alert(`此題最多選 ${max} 項`);
    }
  }
});

// ====== 表單送出 ======
form.addEventListener('submit', (e) => {
  e.preventDefault();
  formError.hidden = true;
  document.querySelectorAll('.question.error').forEach(q => q.classList.remove('error'));

  const errors = validate();
  if (errors.length > 0) {
    errors.forEach(qName => {
      const qDiv = document.querySelector(`.question[data-q="${qName}"]`);
      if (qDiv) qDiv.classList.add('error');
    });
    formError.textContent = `還有 ${errors.length} 題未完成，請往上檢查（紅色標示）`;
    formError.hidden = false;
    const first = document.querySelector('.question.error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = collectAnswers();
  const score = computeScore(data);
  const payload = buildPayload(data, score);

  showReport(score, data);
  sendToBackend(payload);
});

// ====== 驗證 ======
function validate() {
  const errors = [];

  // A 區（4 題）必填
  ['A1','A2','A4'].forEach(name => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) errors.push(name);
  });
  // A3 至少勾一個（沒在用也是一個選項）
  if (!form.querySelector('input[name="A3"]:checked')) errors.push('A3');

  // B 區（6 題）必填
  ['B1','B3','B4','B5'].forEach(name => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) errors.push(name);
  });
  if (!form.querySelector('input[name="B2"]:checked')) errors.push('B2');
  if (!form.querySelector('input[name="B6"]:checked')) errors.push('B6');

  // C 區 30 題
  for (let i = 1; i <= 30; i++) {
    const q = 'Q' + String(i).padStart(2, '0');
    if (!form.querySelector(`input[name="${q}"]:checked`)) errors.push(q);
  }

  // D 區（v3：3 題）
  if (!form.querySelector('input[name="D1"]:checked')) errors.push('D1');
  if (!form.querySelector('input[name="D2"]:checked')) errors.push('D2');
  // D3 開放填答必填
  const d3 = form.querySelector('textarea[name="D3"]');
  if (!d3.value.trim()) errors.push('D3');

  return errors;
}

// ====== 蒐集答案 ======
function collectAnswers() {
  const fd = new FormData(form);
  const single = (name) => fd.get(name) || '';
  const multi = (name) => fd.getAll(name);
  const other = (name) => (fd.get(name + '_other') || '').trim();

  const withOther = (vals, otherKey) => {
    const arr = [...vals];
    if (arr.includes('其他') && other(otherKey)) {
      const i = arr.indexOf('其他');
      arr[i] = '其他:' + other(otherKey);
    }
    return arr;
  };

  const data = {
    A1: single('A1') === '其他' && other('A1') ? '其他:' + other('A1') : single('A1'),
    A2: single('A2'),
    A3: withOther(multi('A3'), 'A3'),
    A4: single('A4'),
    B1: single('B1'),
    B2: multi('B2'),
    B3: parseInt(single('B3'), 10), // v3: 1–5 自評（合併 v2 B3 行為 + B4 自評）
    B4: single('B4'),                // v3 新題：最受挫場景（不計分）
    B5: single('B5'),
    B6: multi('B6'),
    D1: single('D1') === '其他' && other('D1') ? '其他:' + other('D1') : single('D1'),
    D2: withOther(multi('D2'), 'D2'),
    D3: (fd.get('D3') || '').trim(),
    answers: {},
  };
  for (let i = 1; i <= 30; i++) {
    const q = 'Q' + String(i).padStart(2, '0');
    data.answers[q] = single(q);
  }
  return data;
}

// ====== 計分 ======
function computeScore(data) {
  // 各維度分數
  const dimScores = DIMENSIONS.map(dim => {
    const correct = dim.qs.reduce(
      (sum, q) => sum + (data.answers[q] === ANSWER_KEY[q] ? 1 : 0),
      0
    );
    return { code: dim.code, label: dim.label, score: correct, max: 5 };
  });

  const total = dimScores.reduce((s, d) => s + d.score, 0);
  const level = LEVELS.find(L => total >= L.min && total <= L.max);

  // 自我認知差距（v3：用 B3 合併後的 1–5 自評）
  let gap = 'accurate';
  let gapText = '';
  if (data.B3 >= 4 && total <= 10) {
    gap = 'overestimate';
    gapText = '你對自己的評分高於測驗結果——課程可以幫你把信心轉化為實際技能。';
  } else if (data.B3 <= 2 && total >= 16) {
    gap = 'underestimate';
    gapText = '你低估了自己，測驗結果顯示你的能力比你以為的強很多。';
  }

  // Type 判定
  const advancedB6Count = data.B6.filter(v => ADVANCED_B6.includes(v)).length;
  const noneSelected = data.B6.includes('都沒用過');

  let type;
  if (total >= 16 && advancedB6Count >= 2 && data.B3 <= 3) {
    type = 'TypeB'; // 隱藏高手（v3：用 B3 合併後自評）
  } else if (total <= 5 || noneSelected) {
    type = 'TypeC'; // 觀望/抗拒
  } else {
    type = 'TypeA'; // 基礎應用者
  }

  return { dimScores, total, level, gap, gapText, type };
}

// ====== 顯示報告 ======
function showReport(score, data) {
  // 隱藏表單
  form.hidden = true;

  // 層次
  document.getElementById('level-code').textContent = score.level.code;
  document.getElementById('level-label').textContent = score.level.label;
  document.getElementById('level-desc').textContent = score.level.desc;

  // D3 回顯（v3：原 D4 開放填答編號上移為 D3）
  document.getElementById('d4-echo').textContent = data.D3 ? `「${data.D3}」` : '—';

  // 認知差距
  if (score.gapText) {
    document.getElementById('gap-card').hidden = false;
    document.getElementById('gap-text').textContent = score.gapText;
  }

  reportEl.hidden = false;
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 雷達圖
  drawRadar(score.dimScores);
}

// ====== Chart.js 雷達圖 ======
function drawRadar(dimScores) {
  const ctx = document.getElementById('radar-chart').getContext('2d');
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: dimScores.map(d => d.label),
      datasets: [{
        label: '你的得分',
        data: dimScores.map(d => d.score),
        backgroundColor: 'rgba(29, 78, 216, 0.18)',
        borderColor: 'rgba(29, 78, 216, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(29, 78, 216, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}：${ctx.raw} / 5`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1,
            font: { size: 11 },
            color: '#888',
            backdropColor: 'transparent',
          },
          pointLabels: {
            font: { size: 13, weight: '600' },
            color: '#1a1a1a',
          },
          grid: { color: '#e5e5e0' },
          angleLines: { color: '#e5e5e0' },
        },
      },
    },
  });
}

// ====== 組裝送 Sheets 的 payload ======
function buildPayload(data, score) {
  const dimMap = Object.fromEntries(score.dimScores.map(d => [d.code, d.score]));

  return {
    timestamp: new Date().toISOString(),
    A1_部門: data.A1,
    A2_工作性質: data.A2,
    A3_AI工具: data.A3.join('|'),
    A4_耗時階段: data.A4,
    B1_使用頻率: data.B1,
    B2_主要用途: data.B2.join('|'),
    B3_綜合自評: data.B3,
    B4_最受挫場景: data.B4,
    B5_遇問題處理: data.B5,
    B6_進階功能: data.B6.join('|'),
    C_D1_指令設計: dimMap.D1,
    C_D2_數據應用: dimMap.D2,
    C_D3_工具選擇: dimMap.D3,
    C_D4_流程設計: dimMap.D4,
    C_D5_協作委派: dimMap.D5,
    C_D6_風險意識: dimMap.D6,
    C_總分: score.total,
    層次: `${score.level.code} ${score.level.label}`,
    Type: score.type,
    認知差距: score.gap === 'overestimate' ? '高估'
            : score.gap === 'underestimate' ? '低估'
            : '準確',
    D1_最想省: data.D1,
    D2_顧慮: data.D2.join('|'),
    D3_開放填答: data.D3,
    // raw answers for audit
    raw_answers: Object.entries(data.answers).map(([q, v]) => `${q}:${v}`).join(','),
  };
}

// ====== 送到 Google Apps Script ======
function sendToBackend(payload) {
  const statusEl = document.getElementById('submit-status');
  const msgEl = document.getElementById('submit-msg');

  if (!APPS_SCRIPT_URL) {
    statusEl.classList.remove('success');
    msgEl.textContent = '（測試模式）資料未送出 — 請在 script.js 設定 APPS_SCRIPT_URL';
    console.log('[測試模式] payload:', payload);
    return;
  }

  // Apps Script Web App 接收用 text/plain 避免 CORS preflight
  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
    .then(() => {
      statusEl.classList.add('success');
      msgEl.textContent = '✓ 資料已送出，感謝你的填答';
    })
    .catch((err) => {
      statusEl.classList.add('error');
      msgEl.textContent = '⚠ 資料送出失敗，請截圖此頁面回報怡臻';
      console.error(err);
    });
}
