/* ============================================================
   商周 AI Workshop — 課前暖身問卷
   - 表單驗證（A1 + Q1–Q6 必填，L1–L7 全部選填）
   - 簡化結果頁
   - 本地版預設不送 Google Sheet
   ============================================================ */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_aG4Ad74r2pASZfnvQ49zm1xu7r3fj8zI8R276d4Xw_TqECTwHOOZY9dW3dQ8y-63iQ/exec';

const Q5_LABELS = {
  'Prompt寫法': '學會 AI Prompt 寫法',
  '找適合工具': '找到適合自己工作的 AI 工具',
  '最新應用': '了解 AI 最新應用',
  '提升效率': '提升工作效率',
  '部門案例': '學習部門實際案例',
  '工作流程': '了解 AI 如何改變工作流程',
};

const LEVELS = ['L1','L2','L3','L4','L5','L6'];
const LEVEL_LABELS = {
  L1: '會問', L2: '會拆', L3: '會串',
  L4: '會自動化', L5: '會架應用', L6: '會指揮',
};

const form = document.getElementById('assessment-form');
const formError = document.getElementById('form-error');
const reportEl = document.getElementById('report');
const submitBtn = document.getElementById('submit-btn');

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

  // 處理 data-max 上限
  const max = parseInt(t.dataset.max, 10);
  if (max && t.checked) {
    const checkedCount = Array.from(group).filter(cb => cb.checked && cb.dataset.max).length;
    if (checkedCount > max) {
      t.checked = false;
      alert(`此題最多選 ${max} 個`);
    }
  }
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
    const hasLevelError = errors.some(e => e.startsWith('L'));
    const otherCount = errors.filter(e => !e.startsWith('L')).length;
    if (hasLevelError && otherCount === 0) {
      formError.textContent = 'C 區請至少勾選一項「我會這個」才能送出';
    } else {
      formError.textContent = `還有 ${otherCount + (hasLevelError ? 1 : 0)} 題未完成，請往上檢查（紅色標示）`;
    }
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
  if (!form.querySelector('input[name="A1"]:checked')) errors.push('A1');

  ['Q1','Q5'].forEach(name => {
    if (!form.querySelector(`input[name="${name}"]:checked`)) errors.push(name);
  });

  // Q2、Q4 為複選，至少一個
  if (!form.querySelector('input[name="Q2"]:checked')) errors.push('Q2');
  if (!form.querySelector('input[name="Q4"]:checked')) errors.push('Q4');

  // Q3 textarea 必填
  const q3 = form.querySelector('textarea[name="Q3"]');
  if (!q3.value.trim()) errors.push('Q3');

  // C 區：至少勾選一項「我會這個」
  const anyLevelUsed = LEVELS.some(L => form.querySelector(`input[name="${L}_used"]:checked`));
  if (!anyLevelUsed) {
    LEVELS.forEach(L => errors.push(L));
  }

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

  // Q1 五分量表
  const Q1_LABELS = {
    '1': '1 - 從沒使用過',
    '2': '2 - 很少使用',
    '3': '3 - 偶爾使用',
    '4': '4 - 經常使用',
    '5': '5 - 每天都用',
  };
  const q1Raw = single('Q1');
  const q1 = Q1_LABELS[q1Raw] || q1Raw;

  const levels = {};
  LEVELS.forEach(L => {
    levels[L] = {
      used: fd.get(`${L}_used`) === '1',
      tools: withOther(multi(`${L}_tool`), `${L}_tool`),
    };
  });

  return {
    A1: singleWithOther('A1'),
    Q1: q1,
    Q2: withOther(multi('Q2'), 'Q2'),
    Q3: (fd.get('Q3') || '').trim(),
    Q4: withOther(multi('Q4'), 'Q4'),
    Q5: singleWithOther('Q5'),
    levels,
  };
}

// ====== 顯示報告 ======
function showReport(data) {
  form.hidden = true;
  submitBtn.hidden = true;
  renderBulbs(data.levels);
  renderProfile(data);
  renderLevelDetail(data.levels);
  reportEl.hidden = false;
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const BULB_SVG = `
<svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path class="bulb-body" d="M20 4 C 12 4, 6 10, 6 18 C 6 23, 9 27, 12 30 C 13.5 31.5, 14 33, 14 34.5 L 14 38 L 26 38 L 26 34.5 C 26 33, 26.5 31.5, 28 30 C 31 27, 34 23, 34 18 C 34 10, 28 4, 20 4 Z"/>
  <ellipse class="bulb-highlight" cx="14" cy="13" rx="3" ry="4.5" transform="rotate(-20 14 13)"/>
  <rect class="bulb-cap" x="15" y="40" width="10" height="2.5" rx="0.5"/>
  <rect class="bulb-cap" x="16" y="44" width="8" height="2.5" rx="0.5"/>
  <path class="bulb-cap" d="M17 48 L 23 48 L 22 51 L 18 51 Z"/>
</svg>`;

function renderBulbs(levels) {
  const row = document.getElementById('bulbs-row');
  row.innerHTML = LEVELS.map(L => {
    const lit = levels[L].used;
    return `
      <div class="bulb ${lit ? 'lit' : ''}">
        <div class="bulb-icon">${BULB_SVG}</div>
        <span class="bulb-code">${L}</span>
        <span class="bulb-label">${LEVEL_LABELS[L]}</span>
      </div>
    `;
  }).join('');

  const reached = LEVELS.filter(L => levels[L].used);
  const summary = document.getElementById('bulbs-summary');
  if (reached.length > 0) {
    const highest = reached[reached.length - 1];
    summary.innerHTML = `已點亮 <strong>${reached.length}</strong> 個層次 · 目前走到 <strong>${highest}（${LEVEL_LABELS[highest]}）</strong>`;
  } else {
    summary.textContent = '尚未在任一階段實際使用 AI';
  }
}

function renderProfile(data) {
  const list = document.getElementById('profile-list');
  const tools = data.Q2.length > 0 ? data.Q2.join('、') : '—';
  const troubles = data.Q4.length > 0 ? data.Q4.join('、') : '—';
  const rows = [
    ['使用頻率', data.Q1 || '—'],
    ['最常用工具', tools],
    ['最常使用 AI 的內容', data.Q3 || '—'],
    ['最大困擾', troubles],
    ['最希望 Workshop 幫忙', Q5_LABELS[data.Q5] || data.Q5 || '—'],
  ];
  list.innerHTML = rows.map(([k, v]) =>
    `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`
  ).join('');
}

function renderLevelDetail(levels) {
  const card = document.getElementById('level-detail-card');
  const detail = document.getElementById('level-detail');
  const used = LEVELS.filter(L => levels[L].used);
  if (used.length === 0) { card.hidden = true; return; }
  card.hidden = false;
  detail.innerHTML = used.map(L => {
    const tools = levels[L].tools.length > 0 ? levels[L].tools.join('、') : '（未選工具）';
    return `
      <div class="level-detail-row">
        <span class="level-detail-code">${L}</span>
        <span class="level-detail-label">${LEVEL_LABELS[L]}</span>
        <span class="level-detail-tools">${escapeHtml(tools)}</span>
      </div>
    `;
  }).join('');
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
    A1_部門: data.A1,
    Q1_使用頻率: data.Q1,
    Q2_最常用工具: data.Q2.join('|'),
    Q3_最常使用內容: data.Q3,
    Q4_最大困擾: data.Q4.join('|'),
    Q5_最希望幫忙: data.Q5,
  };
  LEVELS.forEach(L => {
    payload[`${L}_有在做`] = data.levels[L].used ? 'Y' : '';
    payload[`${L}_工具`] = data.levels[L].tools.join('|');
  });
  return payload;
}

// ====== 送到 Google Apps Script（預設停用）======
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
