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

// ====== L1–L6 題目層次標記（v3.4：30 題重新按難度分到六層）======
const QUESTION_LEVELS = {
  // L1 會問（基礎提問與多模態）
  Q01:'L1', Q06:'L1', Q14:'L1', Q21:'L1', Q26:'L1',
  // L2 會拆（結構化指令、拆解判斷）
  Q02:'L2', Q07:'L2', Q16:'L2', Q23:'L2', Q27:'L2',
  // L3 會串（串接邏輯、工具選擇）
  Q03:'L3', Q08:'L3', Q12:'L3', Q17:'L3', Q28:'L3',
  // L4 會設計（Few-shot、流程設計、Brief）
  Q04:'L4', Q09:'L4', Q15:'L4', Q18:'L4', Q22:'L4',
  // L5 會自動化（系統提示詞、迭代維護、合規）
  Q05:'L5', Q10:'L5', Q19:'L5', Q20:'L5', Q30:'L5',
  // L6 會指揮（LLM 原生整合、MCP、Skills、AI 治理）
  Q11:'L6', Q13:'L6', Q24:'L6', Q25:'L6', Q29:'L6',
};

// 各層次描述
const LEVEL_INFO = {
  L1: { label:'會問',    desc:'你能用 AI 提問、得到有用的答案。這是所有應用的起點。' },
  L2: { label:'會拆',    desc:'你能寫結構化指令，拆解資料、做初步分析。' },
  L3: { label:'會串',    desc:'你能串接多個工具與邏輯完成複雜任務。' },
  L4: { label:'會設計',  desc:'你能設計工具鏈與工作流，知道怎麼引導 AI 學風格。' },
  L5: { label:'會自動化', desc:'你能建立自動觸發機制、迭代維護流程，人只需監控例外。' },
  L6: { label:'會指揮',  desc:'你掌握 LLM 原生整合、MCP / Skills 等前緣能力，能指揮 Agent 跨工具協同。' },
};

// 進階工具（Type B 偵測用，v3.6 從 B6 改 B7）
const ADVANCED_B7 = [
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

// ====== 圖片點擊放大（lightbox）======
(function setupLightbox() {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const closeBtn = document.getElementById('lightbox-close');
  if (!lightbox || !lightboxImg || !closeBtn) return;

  // 為所有題目圖片加點擊事件
  document.querySelectorAll('.question-image img, .option-image img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt || '';
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    });
  });

  function close() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }
  closeBtn.addEventListener('click', close);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) close();
  });
})();

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

  // A 區（v3.6：3 題）
  ['A1','A2','A3'].forEach(name => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) errors.push(name);
  });

  // B 區（v3.6：7 題）
  ['B1','B3','B4','B5'].forEach(name => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) errors.push(name);
  });
  if (!form.querySelector('input[name="B2"]:checked')) errors.push('B2');
  if (!form.querySelector('input[name="B6"]:checked')) errors.push('B6'); // 最常用 AI 工具
  if (!form.querySelector('input[name="B7"]:checked')) errors.push('B7'); // 進階功能

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
    A3: single('A3') === '其他' && other('A3') ? '其他:' + other('A3') : single('A3'), // v3.6：原 A4 上來
    B1: single('B1'),
    B2: multi('B2'),
    B3: parseInt(single('B3'), 10),
    B4: single('B4'),
    B5: single('B5'),
    B6: withOther(multi('B6'), 'B6'), // v3.6：原 A3 移來（最常用 AI 工具）
    B7: multi('B7'),                   // v3.6：原 B6（進階功能）
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

// ====== 計分（v3.4：同時算「六維分布」+「六層深度」）======
function computeScore(data) {
  // 六維分數（用於雷達圖）
  const dimScores = DIMENSIONS.map(dim => {
    const correct = dim.qs.reduce(
      (sum, q) => sum + (data.answers[q] === ANSWER_KEY[q] ? 1 : 0),
      0
    );
    return { code: dim.code, label: dim.label, score: correct, max: 5 };
  });

  // 六層分數（用於 L1-L6 卡片）
  const levelScores = ['L1','L2','L3','L4','L5','L6'].map(L => {
    const qsInLevel = Object.entries(QUESTION_LEVELS)
      .filter(([_, lv]) => lv === L)
      .map(([q]) => q);
    const correct = qsInLevel.reduce(
      (sum, q) => sum + (data.answers[q] === ANSWER_KEY[q] ? 1 : 0),
      0
    );
    return {
      code: L,
      label: LEVEL_INFO[L].label,
      desc: LEVEL_INFO[L].desc,
      score: correct,
      max: qsInLevel.length, // 每層 5 題
    };
  });

  // 最高達到的層次（用於認知差距 / Type）
  const highestLevel = [...levelScores].reverse().find(L => L.score >= 3);
  const lowLevelStrong = levelScores.slice(0, 3).every(L => L.score >= 4); // L1-L3 都 ≥4
  const highLevelStrong = levelScores.slice(3).reduce((s, L) => s + L.score, 0); // L4-L6 累計

  // 自我認知差距（B3 vs 最高層次）
  let gap = 'accurate';
  let gapText = '';
  if (data.B3 >= 4 && !highestLevel) {
    gap = 'overestimate';
    gapText = '你對自己的評分偏高，但測驗顯示連 L1（會問）都還沒穩——這是課程的好起點，可以把自我感覺轉化為實際技能。';
  } else if (data.B3 <= 2 && highestLevel && (highestLevel.code === 'L5' || highestLevel.code === 'L6')) {
    gap = 'underestimate';
    gapText = `你低估了自己——你已經達到「${highestLevel.code} ${highestLevel.label}」的層次，比你以為的強很多。`;
  }

  // Type 判定（v3.6：用 B7 進階工具勾選）
  const advancedCount = data.B7.filter(v => ADVANCED_B7.includes(v)).length;
  const noneSelected = data.B7.includes('都沒用過');

  let type;
  if (highLevelStrong >= 8 && advancedCount >= 2 && data.B3 <= 3) {
    type = 'TypeB';
  } else if (levelScores[0].score < 3 || noneSelected) {
    type = 'TypeC';
  } else {
    type = 'TypeA';
  }

  return { dimScores, levelScores, highestLevel, gap, gapText, type };
}

// ====== 顯示報告（v3.4：六維雷達 + 六層卡片）======
function showReport(score, data) {
  form.hidden = true;

  // 渲染 L1-L6 卡片（達 4 題以上算「站穩這層」，點亮）
  const levelGrid = document.getElementById('level-grid');
  levelGrid.innerHTML = score.levelScores.map(L => {
    const reached = L.score >= 4;
    return `
    <div class="level-card ${reached ? 'reached' : ''}">
      <div class="level-card-head">
        <div class="level-card-title">
          <span class="level-card-code">${L.code}</span>
          <span class="level-card-label">${L.label}</span>
        </div>
        <span class="level-card-score">${L.score} / ${L.max}</span>
      </div>
      <p class="level-card-desc">${L.desc}</p>
    </div>
  `;
  }).join('');

  // 開放填答回顯
  document.getElementById('d4-echo').textContent = data.D3 ? `「${data.D3}」` : '—';

  // 認知差距
  if (score.gapText) {
    document.getElementById('gap-card').hidden = false;
    document.getElementById('gap-text').textContent = score.gapText;
  }

  reportEl.hidden = false;
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

// ====== 組裝送 Sheets 的 payload（v3.4：六維 + 六層雙視角）======
function buildPayload(data, score) {
  const dimMap = Object.fromEntries(score.dimScores.map(d => [d.code, d.score]));
  const lvlMap = Object.fromEntries(score.levelScores.map(L => [L.code, L.score]));

  return {
    timestamp: new Date().toISOString(),
    A1_部門: data.A1,
    A2_工作性質: data.A2,
    A3_耗時階段: data.A3,
    B1_使用頻率: data.B1,
    B2_主要用途: data.B2.join('|'),
    B3_綜合自評: data.B3,
    B4_最受挫場景: data.B4,
    B5_遇問題處理: data.B5,
    B6_最常用工具: data.B6.join('|'),
    B7_進階功能: data.B7.join('|'),
    // 六維（雷達圖用）
    維_D1_指令設計: dimMap.D1,
    維_D2_數據應用: dimMap.D2,
    維_D3_工具選擇: dimMap.D3,
    維_D4_流程設計: dimMap.D4,
    維_D5_協作委派: dimMap.D5,
    維_D6_風險意識: dimMap.D6,
    // 六層（深度進階）
    層_L1_會問: lvlMap.L1,
    層_L2_會拆: lvlMap.L2,
    層_L3_會串: lvlMap.L3,
    層_L4_會設計: lvlMap.L4,
    層_L5_會自動化: lvlMap.L5,
    層_L6_會指揮: lvlMap.L6,
    最高達層次: score.highestLevel ? `${score.highestLevel.code} ${score.highestLevel.label}` : '未達 L1',
    Type: score.type,
    認知差距: score.gap === 'overestimate' ? '高估'
            : score.gap === 'underestimate' ? '低估'
            : '準確',
    需求_最想省: data.D1,
    需求_顧慮: data.D2.join('|'),
    需求_開放填答: data.D3,
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
