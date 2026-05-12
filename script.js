/* ============================================================
   商周 AI 能力調查問卷
   - A 區（姓名 + 部門 + 職稱）
   - B 區 Q1–Q3（頻率 5 量表 / 最常用工具 / 最常使用內容）
   - C 區 L1–L6（我會這個 + 工具）
   - D 區 D1–D2（困擾 + 期待）
   ============================================================ */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_aG4Ad74r2pASZfnvQ49zm1xu7r3fj8zI8R276d4Xw_TqECTwHOOZY9dW3dQ8y-63iQ/exec';

const D2_LABELS = {
  'Prompt設計': '學會 Prompt 設計',
  '找適合工具': '找到適合工作的 AI 工具',
  '實際案例': '學習部門/同業實際案例',
  '自動化': '學會 AI 自動化流程',
  '做新東西': '學會用 AI 做新東西',
  '最新趨勢': '了解 AI 最新發展',
  '風險邊界': '了解 AI 風險與邊界',
};

const LEVELS = ['L1','L2','L3','L4','L5','L6'];
// 顯示用「面向」名稱（資料內部仍用 L1–L6 為 key）
const LEVEL_LABELS = {
  L1: '對話力',
  L2: '指令力',
  L3: '整合力',
  L4: '自動化力',
  L5: '建構力',
  L6: '編排力',
};

const form = document.getElementById('assessment-form');
const formError = document.getElementById('form-error');
const reportEl = document.getElementById('report');
const submitBtn = document.getElementById('submit-btn');

// ====== A2 其他部門：選了「其他」才顯示填寫欄 ======
const a2Select = form.querySelector('select[name="A2"]');
const a2Other = form.querySelector('input[name="A2_other"]');
if (a2Select && a2Other) {
  a2Select.addEventListener('change', () => {
    a2Other.hidden = a2Select.value !== '其他';
    if (a2Other.hidden) a2Other.value = '';
  });
}

// ====== 互動：複選互斥 ＋ 上限 ======
form.addEventListener('change', (e) => {
  const t = e.target;
  if (t.type !== 'checkbox') return;
  const name = t.name;
  const group = form.querySelectorAll(`input[type="checkbox"][name="${name}"]`);

  if (t.dataset.exclusive === 'true' && t.checked) {
    group.forEach(cb => { if (cb !== t) cb.checked = false; });
  } else if (t.checked) {
    group.forEach(cb => { if (cb.dataset.exclusive === 'true') cb.checked = false; });
  }

  const max = parseInt(t.dataset.max, 10);
  if (max && t.checked) {
    const checkedCount = Array.from(group).filter(cb => cb.checked && cb.dataset.max).length;
    if (checkedCount > max) {
      t.checked = false;
      alert(`此題最多選 ${max} 個`);
    }
  }
});

// ====== 完全不會 → 鎖住該題工具區 ======
form.addEventListener('change', (e) => {
  const t = e.target;
  if (t.type !== 'radio') return;
  if (!/^L[3-6]_level$/.test(t.name)) return;
  const question = t.closest('.level-question');
  const toolsBox = question && question.querySelector('.level-tools');
  if (!toolsBox) return;
  const locked = t.value === '1';
  toolsBox.classList.toggle('locked', locked);
  toolsBox.querySelectorAll('input').forEach(input => {
    input.disabled = locked;
    if (locked) {
      if (input.type === 'checkbox') input.checked = false;
      else if (input.type === 'text') input.value = '';
    }
  });
});

// ====== 表單送出 ======
submitBtn.addEventListener('click', (e) => {
  e.preventDefault();
  handleSubmit();
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSubmit();
});

function handleSubmit() {
  formError.hidden = true;
  document.querySelectorAll('.question.error').forEach(q => q.classList.remove('error'));

  const errors = validate();
  if (errors.length > 0) {
    errors.forEach(qName => {
      const qDiv = document.querySelector(`.question[data-q="${qName}"]`);
      if (qDiv) qDiv.classList.add('error');
    });
    const levelErrors = errors.filter(e => e.startsWith('L'));
    const otherErrors = errors.filter(e => !e.startsWith('L'));
    const missingLevel = levelErrors.filter(L => !form.querySelector(`input[name="${L}_level"]:checked`));
    const missingTool = levelErrors.filter(L => form.querySelector(`input[name="${L}_level"]:checked`));
    const msgParts = [];
    if (otherErrors.length > 0) msgParts.push(`${otherErrors.length} 題未完成`);
    if (missingLevel.length > 0) msgParts.push(`C 區 ${missingLevel.join('、')} 未評分`);
    if (missingTool.length > 0) msgParts.push(`C 區 ${missingTool.join('、')} 熟練度 ≥ 2 須勾至少一個工具`);
    formError.textContent = msgParts.join('；') + '（紅色標示處）';
    formError.hidden = false;
    const first = document.querySelector('.question.error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = collectAnswers();
  showReport(data);
  sendToBackend(buildPayload(data));
}

// ====== 驗證 ======
function validate() {
  const errors = [];

  // A1 姓名
  if (!form.querySelector('input[name="A1"]').value.trim()) errors.push('A1');
  // A2 部門
  if (!a2Select.value) errors.push('A2');
  if (a2Select.value === '其他' && !a2Other.value.trim()) errors.push('A2');
  // A3 職稱
  if (!form.querySelector('input[name="A3"]').value.trim()) errors.push('A3');

  // Q1 頻率
  if (!form.querySelector('input[name="Q1"]:checked')) errors.push('Q1');

  // Q2 最常用工具
  if (!form.querySelector('input[name="Q2"]:checked')) errors.push('Q2');

  // Q3 textarea
  if (!form.querySelector('textarea[name="Q3"]').value.trim()) errors.push('Q3');

  // D1 困擾
  if (!form.querySelector('input[name="D1"]:checked')) errors.push('D1');

  // D2 期待（複選）
  if (!form.querySelector('input[name="D2"]:checked')) errors.push('D2');

  // C 區：每個 L 都要有評分；若 ≥ 2 且該層有工具區，至少要勾一個工具
  LEVELS.forEach(L => {
    const levelInput = form.querySelector(`input[name="${L}_level"]:checked`);
    if (!levelInput) {
      errors.push(L);
      return;
    }
    const hasToolGroup = form.querySelector(`input[name="${L}_tool"]`);
    if (hasToolGroup && levelInput.value !== '1') {
      if (!form.querySelector(`input[name="${L}_tool"]:checked`)) {
        errors.push(L);
      }
    }
  });

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

  const singleWithOther = (name) => {
    const v = single(name);
    if (v === '其他' && other(name)) return '其他:' + other(name);
    return v;
  };

  const levels = {};
  LEVELS.forEach(L => {
    const level = parseInt(fd.get(`${L}_level`) || '0', 10);
    levels[L] = {
      level,
      tools: withOther(multi(`${L}_tool`), `${L}_tool`),
    };
  });

  return {
    A1: single('A1').trim(),
    A2: singleWithOther('A2'),
    A3: single('A3').trim(),
    Q1: single('Q1'),
    Q2: withOther(multi('Q2'), 'Q2'),
    Q3: (fd.get('Q3') || '').trim(),
    D1: withOther(multi('D1'), 'D1'),
    D2: withOther(multi('D2'), 'D2'),
    levels,
  };
}

// ====== 顯示報告 ======
function showReport(data) {
  form.hidden = true;
  submitBtn.hidden = true;
  renderIdentity(data);
  drawRadar(data.levels);
  renderStageSummary(data.levels);
  renderRecommendation(data);
  reportEl.hidden = false;
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderIdentity(data) {
  const card = document.getElementById('identity-card');
  const name = escapeHtml(data.A1 || '—');
  const dept = escapeHtml(data.A2 || '');
  const title = escapeHtml(data.A3 || '');
  const meta = [dept, title].filter(Boolean).join('　·　');
  const avatar = escapeHtml((data.A1 || '?').trim().charAt(0));

  const tags = [];
  if (data.Q1) tags.push(`使用頻率　${escapeHtml(data.Q1)}`);
  const sorted = [...LEVELS].sort((a, b) => data.levels[b].level - data.levels[a].level);
  const strongest = sorted[0];
  if (strongest && data.levels[strongest].level >= 3) {
    tags.push(`最強　${LEVEL_LABELS[strongest]}`);
  }
  const tagHtml = tags.length
    ? `<div class="identity-tags">${tags.map(t => `<span class="identity-tag">${t}</span>`).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="identity-avatar">${avatar}</div>
    <div class="identity-main">
      <div class="identity-name">${name}</div>
      ${meta ? `<div class="identity-meta">${meta}</div>` : ''}
    </div>
    ${tagHtml}
  `;
}

const BULB_SVG = `
<svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path class="bulb-body" d="M20 4 C 12 4, 6 10, 6 18 C 6 23, 9 27, 12 30 C 13.5 31.5, 14 33, 14 34.5 L 14 38 L 26 38 L 26 34.5 C 26 33, 26.5 31.5, 28 30 C 31 27, 34 23, 34 18 C 34 10, 28 4, 20 4 Z"/>
  <ellipse class="bulb-highlight" cx="14" cy="13" rx="3" ry="4.5" transform="rotate(-20 14 13)"/>
  <rect class="bulb-cap" x="15" y="40" width="10" height="2.5" rx="0.5"/>
  <rect class="bulb-cap" x="16" y="44" width="8" height="2.5" rx="0.5"/>
  <path class="bulb-cap" d="M17 48 L 23 48 L 22 51 L 18 51 Z"/>
</svg>`;

function renderStageSummary(levels) {
  const summary = document.getElementById('bulbs-summary');
  // 找最強、最弱面向
  const sorted = [...LEVELS].sort((a, b) => levels[b].level - levels[a].level);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const allLow = LEVELS.every(L => levels[L].level <= 2);
  if (allLow) {
    summary.textContent = '六個面向熟練度都在 1–2 之間 — 未來 AI 課程將從基礎開始帶起';
    return;
  }

  // 強最弱分數相同 → 全部一致，不顯示強弱對比
  if (levels[strongest].level === levels[weakest].level) {
    summary.innerHTML = `各面向熟練度平均 <strong>${levels[strongest].level} / 5</strong>，發展均衡`;
    return;
  }

  summary.innerHTML = `最強：<strong>${LEVEL_LABELS[strongest]}（${levels[strongest].level} / 5）</strong> · 最弱：<strong>${LEVEL_LABELS[weakest]}（${levels[weakest].level} / 5）</strong>`;
}

// ====== 雷達圖 ======
function drawRadar(levels) {
  const ctx = document.getElementById('radar-chart').getContext('2d');
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: LEVELS.map(L => LEVEL_LABELS[L]),
      datasets: [{
        label: '熟練度',
        data: LEVELS.map(L => levels[L].level),
        backgroundColor: 'rgba(200, 22, 30, 0.15)',
        borderColor: 'rgba(200, 22, 30, 0.9)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(200, 22, 30, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.label}：${ctx.raw} / 5` },
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
            font: { size: 12, weight: '600', family: 'Noto Serif TC, serif' },
            color: '#1a1a1a',
          },
          grid: { color: '#e5e5e0' },
          angleLines: { color: '#e5e5e0' },
        },
      },
    },
  });
}

// ====== 學習路徑建議（找最弱面向群組） ======
function renderRecommendation(data) {
  const levels = data.levels;
  const target = document.getElementById('recommendation');

  // 三組面向各自平均
  const groupAvg = (ls) => ls.reduce((s, L) => s + levels[L].level, 0) / ls.length;
  const baseAvg = groupAvg(['L1','L2','L3']); // 普及段
  const autoAvg = groupAvg(['L4']);            // 自動化段
  const advAvg  = groupAvg(['L5','L6']);       // 進階段

  // 找最弱組
  const weakestSingle = [...LEVELS].sort((a,b) => levels[a].level - levels[b].level)[0];
  const groups = [
    { name: 'base', avg: baseAvg, pack: '普及課', desc: 'Prompt 設計、跨工具整合與初步應用', dims: ['對話力','指令力','整合力'] },
    { name: 'auto', avg: autoAvg, pack: '自動化課', desc: '用 Make / n8n / Google Apps Script 把重複任務交給機器跑', dims: ['自動化力'] },
    { name: 'adv',  avg: advAvg,  pack: '進階課', desc: 'Vibe Coding 寫自製工具、設計或使用 AI Agent', dims: ['建構力','編排力'] },
  ];
  const weakestGroup = [...groups].sort((a,b) => a.avg - b.avg)[0];

  let coursePack, courseDesc, reason;
  if (LEVELS.every(L => levels[L].level >= 3)) {
    coursePack = '任一面向深化';
    courseDesc = '六個面向都已具備基本熟練度，可選感興趣的方向深入，或帶領他人';
    reason = '您各面向都有 ≥ 3 的熟練度。';
  } else {
    coursePack = weakestGroup.pack;
    courseDesc = weakestGroup.desc;
    reason = `您最弱的面向是「${LEVEL_LABELS[weakestSingle]}」（${levels[weakestSingle].level} / 5），這組課程能補上這塊。`;
  }

  // 目前已使用的工具（按功能類分組）
  const toolGroups = [
    { title: '自訂 AI 助手', tools: levels.L3.tools },
    { title: '自動化串接', tools: levels.L4.tools },
    { title: 'AI 寫程式', tools: levels.L5.tools },
    { title: 'AI Agent', tools: levels.L6.tools },
  ].filter(g => g.tools && g.tools.length > 0);

  const toolsBlock = toolGroups.length > 0 ? `
    <div class="rec-tools">
      <p class="rec-tools-title">您目前已使用的工具</p>
      ${toolGroups.map(g => `
        <div class="tool-group">
          <span class="tool-group-title">${g.title}</span>
          <div class="tool-chips">
            ${g.tools.map(t => `<span class="tool-chip">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  target.innerHTML = `
    <div class="rec-main">
      <div class="rec-pack">${coursePack}</div>
      <div class="rec-desc">${courseDesc}</div>
      <p class="rec-reason">${reason}</p>
    </div>
    ${toolsBlock}
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ====== 組裝 payload ======
function buildPayload(data) {
  const payload = {
    timestamp: new Date().toISOString(),
    version: 'workshop-warmup',
    A1_姓名: data.A1,
    A2_部門: data.A2,
    A3_職稱: data.A3,
    Q1_使用頻率: data.Q1,
    Q2_常用工具: data.Q2.join('|'),
    Q3_最常使用內容: data.Q3,
    D1_最大困擾: data.D1.join('|'),
    D2_期待幫助: data.D2.join('|'),
  };
  LEVELS.forEach(L => {
    payload[`${L}_熟練度`] = data.levels[L].level || '';
    payload[`${L}_工具`] = data.levels[L].tools.join('|');
  });
  return payload;
}

// ====== 送到 Google Apps Script ======
function sendToBackend(payload) {
  const statusEl = document.getElementById('submit-status');
  const msgEl = document.getElementById('submit-msg');

  if (!APPS_SCRIPT_URL) {
    statusEl.classList.remove('success');
    msgEl.textContent = '（本地測試模式）資料未送出 — 如需收集回覆，請在 script.js 設定 APPS_SCRIPT_URL';
    console.log('[本地測試] payload:', payload);
    return;
  }

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
    .then(() => {
      statusEl.classList.add('success');
      msgEl.textContent = '✓ 資料已送出，感謝您的填答';
    })
    .catch((err) => {
      statusEl.classList.add('error');
      msgEl.textContent = '⚠ 資料送出失敗，請截圖此頁面回報';
      console.error(err);
    });
}
