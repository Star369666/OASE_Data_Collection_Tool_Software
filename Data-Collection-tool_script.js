// ====================================================
// 專案全域配置 (Single Source of Truth)
// 往後修改預設權重、門檻或遊戲連結，只要修改這裡！
// ====================================================
const CONFIG = {
  defaultTextWeight: 0.5, // 0.5 代表 55 開；0.7 代表文字 70%、圖片 30%
  minRecordsForGame: 3,   // 解鎖小遊戲需要的筆數
  gameUrl: 'https://kws.oaselab.org/'
};

// 執行時狀態管理
let state = {
  w1: Number((1.0 - CONFIG.defaultTextWeight).toFixed(2)), // 圖片權重
  w2: Number(CONFIG.defaultTextWeight.toFixed(2))          // 文字權重
};

let records = [];     // 軟體資料模型
let hwRecords = [];   // 硬體資料模型
let currentMode = 'soft'; // 'soft' | 'hard'
let currentLang = 'zh';   // 'zh' | 'en'
let currentImages = { currImg1: null, currImg2: null };
let exportCount = 0;

function tr(zhText, enText) {
  return currentLang === 'en' ? enText : zhText;
}

// 軟體 / 硬體 各自獨立的暫存表單（切換模式時互不覆蓋）
const formStash = { soft: null, hard: null };
const lastStep = { soft: ['tab-Step1', 'btn-tab1'], hard: ['tab-Step1', 'btn-tab1'] };
const FORM_FIELDS = [
  'chinese', 'engText', 'distance', 'distanceRange', 'light', 'lightRange',
  'gaiText', 'gaiTextCn', 'hegaiText', 'hegaiTextRange', 'v1', 'v1Range', 'v2', 'v2Range'
];

function getList(mode = currentMode) {
  return mode === 'hard' ? hwRecords : records;
}

function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 頁面載入完成時，以 CONFIG 為準初始化畫面
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initLang();
  applyModeUI();
  initStrictIntInputs();

  const initialSliderVal = Math.round(CONFIG.defaultTextWeight * 100);
  const slider = document.getElementById('weightSlider');
  if (slider) {
    slider.value = initialSliderVal;
  }
  onWeightSliderChange(initialSliderVal);
});

// ----------------------------------------------------
// 主題：亮色 / 深色 / 灰色（記住使用者選擇）
// ----------------------------------------------------
const THEME_KEY = 'qci-theme';
const THEMES = ['light', 'dark', 'gray'];

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'light';
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 無法儲存時略過 */ }
  const radio = document.querySelector(`input[name="theme"][value="${theme}"]`);
  if (radio) radio.checked = true;
}

function initTheme() {
  let theme = 'light';
  try { theme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { /* ignore */ }
  applyTheme(theme);
}

// ----------------------------------------------------
// 語言切換：中文 (zh) / 英文 (en)（排除底部 footer）
// ----------------------------------------------------
const LANG_KEY = 'qci-lang';

function applyLang(lang) {
  currentLang = (lang === 'en') ? 'en' : 'zh';
  document.documentElement.setAttribute('lang', currentLang === 'en' ? 'en' : 'zh-TW');
  document.title = tr('QCI&AI資料模型蒐集', 'QCI&AI Data Model Collection');
  try { localStorage.setItem(LANG_KEY, currentLang); } catch (e) { /* ignore */ }

  const radio = document.querySelector(`input[name="lang"][value="${currentLang}"]`);
  if (radio) radio.checked = true;

  document.querySelectorAll('[data-zh][data-en]').forEach(el => {
    el.textContent = currentLang === 'en' ? el.dataset.en : el.dataset.zh;
  });
  document.querySelectorAll('[data-html-zh][data-html-en]').forEach(el => {
    el.innerHTML = currentLang === 'en' ? el.dataset.htmlEn : el.dataset.htmlZh;
  });
  document.querySelectorAll('[data-ph-zh][data-ph-en]').forEach(el => {
    el.placeholder = currentLang === 'en' ? el.dataset.phEn : el.dataset.phZh;
  });

  applyModeUI();
  refreshPreviews();
  updateSubmitBtn();
  renderRecordTable();
}

function initLang() {
  let lang = 'zh';
  try { lang = localStorage.getItem(LANG_KEY) || 'zh'; } catch (e) { /* ignore */ }
  applyLang(lang);
}

// ----------------------------------------------------
// 軟體 / 硬體 模式切換
// ----------------------------------------------------
function applyModeUI() {
  const isHard = currentMode === 'hard';
  const isEn = currentLang === 'en';
  document.body.setAttribute('data-mode', currentMode);
  document.querySelectorAll('.mode-btn').forEach(b => {
    const on = b.dataset.mode === currentMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-soft][data-hard]').forEach(el => {
    const key = isHard
      ? (isEn && el.dataset.hardEn ? 'hardEn' : 'hard')
      : (isEn && el.dataset.softEn ? 'softEn' : 'soft');
    el.textContent = el.dataset[key];
  });
  document.querySelectorAll('[data-ph-soft][data-ph-hard]').forEach(el => {
    const key = isHard
      ? (isEn && el.dataset.phHardEn ? 'phHardEn' : 'phHard')
      : (isEn && el.dataset.phSoftEn ? 'phSoftEn' : 'phSoft');
    el.placeholder = el.dataset[key];
  });
}

function setMode(mode) {
  if (mode === currentMode) return;

  const onList = document.getElementById('tab-list').classList.contains('active');

  // 1. 暫存目前模式的表單
  formStash[currentMode] = captureForm();

  // 2. 切換模式
  currentMode = mode;
  applyModeUI();

  // 3. 還原目標模式的表單（沒有暫存就是空白表單）
  applyForm(formStash[mode]);

  // 4. 畫面：在清單頁就留在清單；否則回到該模式上次所在的步驟
  if (!onList) {
    const [tabId, btnId] = lastStep[mode];
    switchTab(tabId, btnId);
  }
  renderRecordTable();
}

function captureForm() {
  const fields = {};
  FORM_FIELDS.forEach(id => { fields[id] = document.getElementById(id).value; });
  return {
    fields,
    images: { ...currentImages },
    editingIndex: document.getElementById('editingIndex').value
  };
}

function applyForm(s) {
  if (!s) { resetForm(); return; }
  FORM_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    el.value = s.fields[id];
    el.style.borderColor = '';
  });
  currentImages = { ...s.images };
  document.getElementById('editingIndex').value = s.editingIndex;
  refreshPreviews();
  calcHEGAI();
  updateSubmitBtn();
  updateCancelBtnVisibility();
}

// ----------------------------------------------------
// 權重連動核心（徹底避免 0 || 預設值的型態誤判陷阱）
// ----------------------------------------------------
function onWeightSliderChange(sliderVal, fromInput = false) {
  const val = Number(sliderVal);
  const textPercent = val;          // 0 ~ 100
  const imgPercent = 100 - val;     // 100 ~ 0

  state.w1 = Number((imgPercent / 100).toFixed(2));
  state.w2 = Number((textPercent / 100).toFixed(2));

  const pV1Elem = document.getElementById('percentV1');
  const pV2Elem = document.getElementById('percentV2');
  if (pV1Elem) pV1Elem.innerText = `${imgPercent}%`;
  if (pV2Elem) pV2Elem.innerText = `${textPercent}%`;

  // 輸入框顯示「圖圖相符」權重（使用者正在輸入時不覆寫，避免游標跳動）
  const imgInput = document.getElementById('weightImgInput');
  if (imgInput && !fromInput) {
    imgInput.value = imgPercent;
    imgInput.style.borderColor = '';
  }

  // 1. 即時計算 Step 3 預覽分數
  calcHEGAI();

  // 2. 即時連動更新清單頁面
  renderRecordTable();
}

// 權重輸入框：輸入「圖圖相符」權重 (0-100)，轉換為滑桿值（圖文相符 = 100 - 輸入值）
function onWeightInputChange(inputVal) {
  const input = document.getElementById('weightImgInput');
  const num = Number(inputVal);
  if (inputVal === '' || isNaN(num) || num < 0 || num > 100) {
    input.style.borderColor = '#dc2626';
    return;
  }
  input.style.borderColor = '';
  const imgPercent = Math.round(num);
  document.getElementById('weightSlider').value = 100 - imgPercent;
  onWeightSliderChange(100 - imgPercent, true);
}

function calcHEGAI() {
  const v1Elem = document.getElementById('v1');
  const v2Elem = document.getElementById('v2');
  if (!v1Elem || !v2Elem) return 0;

  const v1 = v1Elem.value;
  const v2 = v2Elem.value;

  if (v1 === '' || v2 === '' || isNaN(Number(v1)) || isNaN(Number(v2))) {
    const scoreElem = document.getElementById('hegaiFinal');
    if (scoreElem) scoreElem.innerText = '--';
    return 0;
  }

  const finalScore = Number((state.w1 * Number(v1) + state.w2 * Number(v2)).toFixed(1));
  const scoreElem = document.getElementById('hegaiFinal');
  if (scoreElem) scoreElem.innerText = finalScore;
  return finalScore;
}

// ----------------------------------------------------
// 收集清單（軟體 / 硬體 兩張表 + 統計）
// ----------------------------------------------------
function calcScore(r) {
  return Number((state.w1 * Number(r.v1) + state.w2 * Number(r.v2)).toFixed(1));
}

function thumbCell(img) {
  return img
    ? `<img src="${img.base64}" style="max-height:45px; max-width:60px; object-fit:contain;">`
    : tr('[無圖]', '[No Image]');
}

function actionCell(i, type) {
  return `
        <td>
          <button class="btn-edit" onclick="editRecord(${i}, '${type}')">${tr('編輯', 'Edit')}</button>
          <button class="btn-danger" onclick="deleteRecord(${i}, '${type}')">${tr('刪除', 'Delete')}</button>
        </td>`;
}

function textCell(text) {
  const t = escapeHtml(text);
  return `<td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${t}">${t}</td>`;
}

function renderRecordTable() {
  const softBody = document.getElementById('recordTableBody');
  const hardBody = document.getElementById('hwRecordTableBody');
  if (!softBody || !hardBody) return;

  const s = records.length;
  const h = hwRecords.length;
  const total = s + h;

  // 統計欄位
  document.getElementById('statSoft').innerText = s;
  document.getElementById('statHard').innerText = h;
  document.getElementById('statTotal').innerText = total;
  document.getElementById('softCount').innerText = tr(`${s} 筆`, `${s} records`);
  document.getElementById('hardCount').innerText = tr(`${h} 筆`, `${h} records`);
  document.getElementById('listCount').innerText = tr(`${total} 筆`, `${total} records`);
  document.getElementById('tabListCount').innerText = total;

  // 小遊戲按鈕判定 (達門檻解鎖)
  const gameBtn = document.getElementById('gameLinkBtn');
  const gameStatus = document.getElementById('gameLockStatus');
  if (gameBtn && gameStatus) {
    if (total >= CONFIG.minRecordsForGame) {
      gameBtn.disabled = false;
      gameBtn.innerText = tr('🎮 前往小遊戲', '🎮 Play Mini Game');
      gameStatus.innerText = tr('（已解鎖！）', '(Unlocked!)');
      gameStatus.style.color = '#15803d';
    } else {
      const rem = CONFIG.minRecordsForGame - total;
      gameBtn.disabled = true;
      gameBtn.innerText = tr('🔒 尚未解鎖', '🔒 Locked');
      gameStatus.innerText = tr(`（再收集 ${rem} 筆即可解鎖）`, `(Collect ${rem} more to unlock)`);
      gameStatus.style.color = '#86198f';
    }
  }

  const emptyMsg = tr('目前尚無已暫存的資料', 'No records saved yet');

  // 軟體
  softBody.innerHTML = s === 0
    ? `<tr><td colspan="13" class="empty-row">${emptyMsg}</td></tr>`
    : records.map((r, i) => {
      // 依當前最新權重動態計算分數
      const currentScore = calcScore(r);
      r.finalScore = currentScore;
      return `
      <tr>${actionCell(i, 'soft')}
        <td>${i + 1}</td>
        <td>${thumbCell(r.img1)}</td>
        <td>${escapeHtml(r.chinese)}</td>
        <td>${escapeHtml(r.engText)}</td>
        <td>${r.distance}</td>
        <td>${r.light}</td>
        ${textCell(r.gaiText)}
        <td>${r.hegaiText}</td>
        <td>${thumbCell(r.img2)}</td>
        <td>${r.v1}</td>
        <td>${r.v2}</td>
        <td><b>${currentScore}</b></td>
      </tr>`;
    }).join('');

  // 硬體
  hardBody.innerHTML = h === 0
    ? `<tr><td colspan="12" class="empty-row">${emptyMsg}</td></tr>`
    : hwRecords.map((r, i) => {
      const currentScore = calcScore(r);
      r.finalScore = currentScore;
      return `
      <tr>${actionCell(i, 'hard')}
        <td>${i + 1}</td>
        <td>${thumbCell(r.img1)}</td>
        <td>${r.distance}</td>
        <td>${r.light}</td>
        ${textCell(r.gaiTextCn)}
        ${textCell(r.gaiText)}
        <td>${r.hegaiText}</td>
        <td>${thumbCell(r.img2)}</td>
        <td>${r.v1}</td>
        <td>${r.v2}</td>
        <td><b>${currentScore}</b></td>
      </tr>`;
    }).join('');

  updateCancelBtnVisibility();
}

// ----------------------------------------------------
// 輸入防呆與同步（權重 0-100、HEGAIText / HEGAIImage_v1 / v2 0-10 僅允許輸入範圍內非負整數）
// ----------------------------------------------------
function isValidStrictInt(str, min, max) {
  if (str === '') return true;
  if (!/^(0|[1-9][0-9]*)$/.test(str)) return false;
  const num = Number(str);
  return num >= min && num <= max;
}

function setupStrictIntInput(id, min, max) {
  const el = document.getElementById(id);
  if (!el) return;

  let lastValid = isValidStrictInt(el.value, min, max) ? el.value : '';

  const syncLastValid = () => {
    if (!(el.validity && el.validity.badInput) && isValidStrictInt(el.value, min, max)) {
      lastValid = el.value;
    }
  };

  const restoreLastValid = () => {
    if (lastValid === '') {
      el.value = '0';
      el.value = '';
    } else {
      el.value = '';
      el.value = lastValid;
    }
  };

  el.addEventListener('focus', syncLastValid, true);

  el.addEventListener('keydown', (e) => {
    syncLastValid();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'
    ];
    if (allowedKeys.includes(e.key)) return;

    // 1. 禁止數字以外的任何符號與字母（如 a-z、!@#-+.eE 等）
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return;
    }

    // 2. 輸入符合範圍的數字後，若再按數字會超出範圍或產生前導 0（如輸入 6 再按 1 變成 61），必須先刪掉才能重打
    if (lastValid !== '' && !isValidStrictInt(lastValid + e.key, min, max)) {
      e.preventDefault();
    }
  }, true);

  el.addEventListener('beforeinput', (e) => {
    syncLastValid();
    if (e.inputType && e.inputType.startsWith('delete')) return;
    if (e.data != null) {
      if (!/^[0-9]+$/.test(e.data)) {
        e.preventDefault();
        return;
      }
      if (!isValidStrictInt(lastValid + e.data, min, max)) {
        e.preventDefault();
      }
    }
  }, true);

  el.addEventListener('paste', (e) => {
    syncLastValid();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!/^[0-9]+$/.test(pasted) || !isValidStrictInt(lastValid + pasted, min, max)) {
      e.preventDefault();
    }
  }, true);

  el.addEventListener('input', (e) => {
    const isDelete = e.inputType && e.inputType.startsWith('delete');
    const isSpinOrReplace = e.inputType === 'insertReplacementText' || e.inputType == null;
    if ((el.validity && el.validity.badInput) || !isValidStrictInt(el.value, min, max)) {
      restoreLastValid();
      e.stopImmediatePropagation();
      return;
    }
    if (!isDelete && !isSpinOrReplace && lastValid !== '' && !el.value.startsWith(lastValid)) {
      restoreLastValid();
      e.stopImmediatePropagation();
      return;
    }
    lastValid = el.value;
  }, true);
}

function setupClampedIntInput(id, min, max) {
  const el = document.getElementById(id);
  if (!el) return;

  const maxStr = String(max);
  let lastValid = isValidStrictInt(el.value, min, max) ? el.value : '';

  const syncLastValid = () => {
    if (!(el.validity && el.validity.badInput) && isValidStrictInt(el.value, min, max)) {
      lastValid = el.value;
    }
  };

  const restoreLastValid = () => {
    if (lastValid === '') {
      el.value = '0';
      el.value = '';
    } else {
      el.value = '';
      el.value = lastValid;
    }
  };

  el.addEventListener('focus', syncLastValid, true);

  el.addEventListener('keydown', (e) => {
    syncLastValid();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'
    ];
    if (allowedKeys.includes(e.key)) return;

    // 1. 禁止數字以外的任何符號與字母（如 a-z、!@#-+.eE 等）
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return;
    }

    // 3. 若數值已經是最大值（或已為 0），不得再輸入數字
    if (lastValid === maxStr || lastValid === '0') {
      e.preventDefault();
      return;
    }

    // 2. 若按下數字後數值超出範圍，則直接填入最大值
    const candidate = lastValid + e.key;
    if (Number(candidate) > max) {
      e.preventDefault();
      el.value = maxStr;
      lastValid = maxStr;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, true);

  el.addEventListener('beforeinput', (e) => {
    syncLastValid();
    if (e.inputType && e.inputType.startsWith('delete')) return;
    if (e.data != null) {
      if (!/^[0-9]+$/.test(e.data)) {
        e.preventDefault();
        return;
      }
      if (lastValid === maxStr || lastValid === '0') {
        e.preventDefault();
        return;
      }
      const candidate = lastValid + e.data;
      if (/^0[0-9]+$/.test(candidate)) {
        e.preventDefault();
        return;
      }
      if (Number(candidate) > max) {
        e.preventDefault();
        el.value = maxStr;
        lastValid = maxStr;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, true);

  el.addEventListener('paste', (e) => {
    syncLastValid();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!/^[0-9]+$/.test(pasted) || lastValid === maxStr || lastValid === '0') {
      e.preventDefault();
      return;
    }
    const candidate = lastValid + pasted;
    if (/^0[0-9]+$/.test(candidate)) {
      e.preventDefault();
      return;
    }
    if (Number(candidate) > max) {
      e.preventDefault();
      el.value = maxStr;
      lastValid = maxStr;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, true);

  el.addEventListener('input', (e) => {
    const isDelete = e.inputType && e.inputType.startsWith('delete');
    const isSpinOrReplace = e.inputType === 'insertReplacementText' || e.inputType == null;
    if ((el.validity && el.validity.badInput) || !/^[0-9]*$/.test(el.value) || /^0[0-9]+$/.test(el.value)) {
      restoreLastValid();
      e.stopImmediatePropagation();
      return;
    }
    if (!isDelete && !isSpinOrReplace && (lastValid === maxStr || lastValid === '0')) {
      restoreLastValid();
      e.stopImmediatePropagation();
      return;
    }
    if (el.value !== '' && Number(el.value) > max) {
      el.value = maxStr;
      lastValid = maxStr;
      return;
    }
    lastValid = el.value;
  }, true);
}

function initStrictIntInputs() {
  setupStrictIntInput('weightImgInput', 0, 100);
  setupClampedIntInput('distance', 0, 255);
  setupClampedIntInput('light', 0, 4000);
  setupClampedIntInput('hegaiText', 0, 10);
  setupClampedIntInput('v1', 0, 10);
  setupClampedIntInput('v2', 0, 10);
}

function syncInput(sourceId, targetId, triggerCalc = false, min = null, max = null) {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);
  let val = source.value;

  if (val !== '' && min !== null && max !== null) {
    const num = Number(val);
    source.style.borderColor = (!isNaN(num) && num >= min && num <= max) ? '' : '#dc2626';
  }

  target.value = val;
  if (triggerCalc) calcHEGAI();
}

function isValidNumber(valStr, min, max) {
  if (valStr === '' || valStr === null || valStr === undefined) return false;
  const num = Number(valStr);
  return !isNaN(num) && num >= min && num <= max;
}

function validateStep0(msgElemId) {
  const userName = document.getElementById('userName').value.trim();
  if (!userName) {
    showNotice(msgElemId, tr('⚠️ 請先在最上方填寫「你的名字」！', '⚠️ Please enter "Your Name" at the top first!'), true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
  }
  return true;
}

// ----------------------------------------------------
// 分頁與導航
// ----------------------------------------------------
function switchTab(tabId, btnId) {
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (btnId) document.getElementById(btnId).classList.add('active');
  if (tabId === 'tab-list') {
    // 一旦進入收集清單，根據目前模式 (軟體或硬體) 立即清空 Step 1 ~ Step 3 暫存表格
    resetForm();
    formStash[currentMode] = null;
    lastStep[currentMode] = ['tab-Step1', 'btn-tab1'];
  } else {
    lastStep[currentMode] = [tabId, btnId];
  }
  updateCancelBtnVisibility();
}

function goBackTo(tabId, btnId) {
  switchTab(tabId, btnId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startNewRecord(mode) {
  if (!validateStep0('exportMsg')) return;
  if (mode && mode !== currentMode) setMode(mode);
  const [tabId, btnId] = lastStep[currentMode] || ['tab-Step1', 'btn-tab1'];
  switchTab(tabId, btnId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearAllTempForms() {
  resetForm();
  formStash.soft = null;
  formStash.hard = null;
  lastStep.soft = ['tab-Step1', 'btn-tab1'];
  lastStep.hard = ['tab-Step1', 'btn-tab1'];
  showNotice('exportMsg', tr('✅ 已清空軟體和硬體暫存表格！', '✅ Software and hardware temporary forms have been cleared!'));
}

function cancelToTab4() {
  switchTab('tab-list', 'btn-tab4');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateCancelBtnVisibility() {
  const isEditing = document.getElementById('editingIndex').value !== '-1';
  const hasAny = records.length + hwRecords.length > 0;
  document.getElementById('cancelStep1Btn').style.display = (hasAny || isEditing) ? 'block' : 'none';
}

function updateSubmitBtn() {
  const idx = parseInt(document.getElementById('editingIndex').value, 10);
  const btn = document.getElementById('submitBtn');
  if (!btn) return;
  btn.innerText = idx === -1
    ? tr('💾 儲存並前往收集清單', '💾 Save & Go to Collection List')
    : tr(`💾 儲存修改 (第 ${idx + 1} 筆)`, `💾 Save Changes (Record #${idx + 1})`);
}

function getEditingRecord() {
  const idx = parseInt(document.getElementById('editingIndex').value, 10);
  return idx !== -1 ? getList()[idx] : null;
}

function goToStep2() {
  if (!validateStep0('Step1Msg')) return;

  const isHard = currentMode === 'hard';
  const chinese = document.getElementById('chinese').value.trim();
  const engText = document.getElementById('engText').value.trim();
  const editing = getEditingRecord();
  const currentImg1 = currentImages.currImg1 || (editing ? editing.img1 : null);
  const distanceVal = document.getElementById('distance').value;
  const lightVal = document.getElementById('light').value;

  if (!isHard && (!chinese || !engText)) {
    showNotice('Step1Msg', tr('⚠️ 請務必填寫「中文語句」與「翻譯英文句子」！', '⚠️ Please fill in both "Chinese" and "Translated English Text"!'), true);
    return;
  }
  if (!currentImg1) {
    showNotice('Step1Msg', isHard
      ? tr('⚠️ 請先上傳拍攝圖片 (Shooting Image)！', '⚠️ Please upload the Shooting Image first!')
      : tr('⚠️ 請先上傳第1張生成圖片 (Generated Image)！', '⚠️ Please upload the first Generated Image first!'), true);
    return;
  }
  if (!isValidNumber(distanceVal, 0, 255) || !isValidNumber(lightVal, 0, 4000)) {
    showNotice('Step1Msg', tr('⚠️ 請確實填寫或滑動設定「Distance」與「Light」數值！', '⚠️ Please enter or slide to set both "Distance" and "Light" values!'), true);
    return;
  }

  document.getElementById('Step2-ref-img1').src = currentImg1.base64;
  document.getElementById('Step2-ref-img1').style.display = 'block';

  switchTab('tab-Step2', 'btn-tab2');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToStep3() {
  if (!validateStep0('Step2Msg')) return;

  const gaiText = document.getElementById('gaiText').value.trim();
  const hegaiTextVal = document.getElementById('hegaiText').value;

  if (!gaiText) {
    showNotice('Step2Msg', currentMode === 'hard'
      ? tr('⚠️ 請輸入 GAIText (English) 描述文字！', '⚠️ Please enter the GAIText (English) description!')
      : tr('⚠️ 請輸入 GAIText (反向生成的英文描述)！', '⚠️ Please enter the GAIText description!'), true);
    return;
  }
  if (!isValidNumber(hegaiTextVal, 0, 10)) {
    showNotice('Step2Msg', tr('⚠️ 請設定 HEGAIText 評分！', '⚠️ Please set the HEGAIText score!'), true);
    return;
  }

  const editing = getEditingRecord();
  const currentImg1 = currentImages.currImg1 || (editing ? editing.img1 : null);
  document.getElementById('Step3-ref-img1').src = currentImg1.base64;
  document.getElementById('Step3-ref-img1').style.display = 'block';
  document.getElementById('Step3-ref-text').innerText = gaiText;

  calcHEGAI();
  switchTab('tab-Step3', 'btn-tab3');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showNotice(elemId, text, isError = false) {
  const box = document.getElementById(elemId);
  box.innerText = text;
  box.className = 'msg-box ' + (isError ? 'msg-error' : 'msg-success');
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 3500);
}

function handleImage(input, prevId, storeKey) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      const img = new Image();
      img.onload = function() {
        currentImages[storeKey] = {
          base64: base64,
          ext: file.type.includes('png') ? 'png' : 'jpeg',
          width: img.naturalWidth,
          height: img.naturalHeight,
          file: file,
          name: file.name
        };
        
        if (storeKey === 'currImg1') {
          document.getElementById(prevId).src = base64;
          document.getElementById(prevId).style.display = 'block';
          document.getElementById('prev1-container').style.display = 'block';
        }
        if (storeKey === 'currImg2') {
          document.getElementById('Step3-ref-img2-v1').src = base64;
          document.getElementById('Step3-ref-img2-v1').style.display = 'block';
          document.getElementById('Step3-ref-img2-v2').src = base64;
          document.getElementById('Step3-ref-img2-v2').style.display = 'block';
        }
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  } else if (currentImages[storeKey]) {
    syncFileInput(input.id, currentImages[storeKey]);
  }
}

// 同步 <input type="file"> 顯示的檔案名稱（切換軟硬體模式或編輯時保留已上傳圖片檔名，無圖時清空）
function syncFileInput(inputId, imgObj) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (!imgObj) {
    input.value = '';
    return;
  }
  try {
    const dt = new DataTransfer();
    const ext = imgObj.ext || 'png';
    const file = (imgObj.file instanceof File)
      ? imgObj.file
      : new File([''], imgObj.name || `uploaded.${ext}`, { type: `image/${ext}` });
    dt.items.add(file);
    input.files = dt.files;
  } catch (e) { /* 舊版瀏覽器備援 */ }
}

// 依 currentImages 與欄位內容重新整理各步驟的圖片/文字預覽與檔案選擇器檔名
function setImg(id, img) {
  const el = document.getElementById(id);
  if (img) {
    el.src = img.base64;
    el.style.display = 'block';
  } else {
    el.removeAttribute('src');
    el.style.display = 'none';
  }
}

function refreshPreviews() {
  const i1 = currentImages.currImg1;
  const i2 = currentImages.currImg2;
  setImg('prev1', i1);
  document.getElementById('prev1-container').style.display = i1 ? 'block' : 'none';
  setImg('Step2-ref-img1', i1);
  setImg('Step3-ref-img1', i1);
  setImg('Step3-ref-img2-v1', i2);
  setImg('Step3-ref-img2-v2', i2);
  syncFileInput('genImageInput', i1);
  syncFileInput('gaiImageInput', i2);
  const t = document.getElementById('gaiText').value.trim();
  document.getElementById('Step3-ref-text').innerText = t || tr('（尚未輸入文字）', '(No text entered yet)');
}

function calculateFitDimensions(origWidth, origHeight, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / origWidth, maxHeight / origHeight);
  return { width: Math.round(origWidth * ratio), height: Math.round(origHeight * ratio) };
}

function saveRecord() {
  if (!validateStep0('actionMsg')) return;

  const mode = currentMode;
  const list = getList(mode);
  const editingIdx = parseInt(document.getElementById('editingIndex').value, 10);
  const editing = editingIdx !== -1 ? list[editingIdx] : null;

  const currentImg1 = currentImages.currImg1 || (editing ? editing.img1 : null);
  const currentImg2 = currentImages.currImg2 || (editing ? editing.img2 : null);

  if (!currentImg1 || !currentImg2) {
    showNotice('actionMsg', tr('⚠️ 請完成第2張圖片的上傳後再新增！', '⚠️ Please upload the second image (GAIImage) before saving!'), true);
    return;
  }
  
  const v1Val = document.getElementById('v1').value;
  const v2Val = document.getElementById('v2').value;
  if (!isValidNumber(v1Val, 0, 10) || !isValidNumber(v2Val, 0, 10)) {
    showNotice('actionMsg', tr('⚠️ 請設定 HEGAIImage_v1 與 v2 評分！', '⚠️ Please set both HEGAIImage_v1 and HEGAIImage_v2 scores!'), true);
    return;
  }

  const record = {
    distance: Number(document.getElementById('distance').value),
    light: Number(document.getElementById('light').value),
    gaiText: document.getElementById('gaiText').value.trim(),
    hegaiText: Number(document.getElementById('hegaiText').value),
    v1: Number(v1Val),
    v2: Number(v2Val),
    finalScore: Number(calcHEGAI()),
    img1: currentImg1,
    img2: currentImg2
  };
  if (mode === 'soft') {
    record.chinese = document.getElementById('chinese').value.trim();
    record.engText = document.getElementById('engText').value.trim();
  } else {
    record.gaiTextCn = document.getElementById('gaiTextCn').value.trim();
  }

  const labelZh = mode === 'hard' ? '硬體' : '軟體';
  const labelEn = mode === 'hard' ? 'Hardware' : 'Software';
  if (editingIdx === -1) {
    list.push(record);
    showNotice('exportMsg', tr(`✅ 已成功新增一筆${labelZh}資料！`, `✅ Successfully added 1 ${labelEn} record!`), false);
  } else {
    list[editingIdx] = record;
    document.getElementById('editingIndex').value = '-1';
    updateSubmitBtn();
    showNotice('exportMsg', tr(`✅ ${labelZh}第 ${editingIdx + 1} 筆資料已更新！`, `✅ ${labelEn} record #${editingIdx + 1} has been updated!`), false);
  }

  renderRecordTable();
  switchTab('tab-list', 'btn-tab4');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function editRecord(index, type) {
  if (type && type !== currentMode) setMode(type);

  const r = getList()[index];
  const setVal = (id, v) => { document.getElementById(id).value = v; };

  setVal('chinese', r.chinese === undefined || r.chinese === '（未填寫）' ? '' : r.chinese);
  setVal('engText', r.engText === undefined || r.engText === '（未填寫）' ? '' : r.engText);
  setVal('gaiTextCn', r.gaiTextCn === undefined ? '' : r.gaiTextCn);

  setVal('distance', r.distance);
  setVal('distanceRange', r.distance);
  setVal('light', r.light);
  setVal('lightRange', r.light);
  setVal('gaiText', r.gaiText);
  setVal('hegaiText', r.hegaiText);
  setVal('hegaiTextRange', r.hegaiText);
  setVal('v1', r.v1);
  setVal('v1Range', r.v1);
  setVal('v2', r.v2);
  setVal('v2Range', r.v2);

  currentImages = { currImg1: r.img1, currImg2: r.img2 };
  refreshPreviews();
  calcHEGAI();

  document.getElementById('editingIndex').value = index;
  updateSubmitBtn();
  switchTab('tab-Step1', 'btn-tab1');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  FORM_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    el.style.borderColor = '';
  });
  document.getElementById('chinese').value = '';
  document.getElementById('engText').value = '';
  document.getElementById('gaiText').value = '';
  document.getElementById('gaiTextCn').value = '';
  document.getElementById('genImageInput').value = '';
  document.getElementById('gaiImageInput').value = '';

  currentImages = { currImg1: null, currImg2: null };
  document.getElementById('editingIndex').value = '-1';

  document.getElementById('distance').value = '';
  document.getElementById('distanceRange').value = 127;
  document.getElementById('light').value = '';
  document.getElementById('lightRange').value = 2000;
  document.getElementById('hegaiText').value = '';
  document.getElementById('hegaiTextRange').value = 5;
  document.getElementById('v1').value = '';
  document.getElementById('v1Range').value = 5;
  document.getElementById('v2').value = '';
  document.getElementById('v2Range').value = 5;

  refreshPreviews();
  document.getElementById('hegaiFinal').innerText = '--';
  updateSubmitBtn();
  updateCancelBtnVisibility();
}

function deleteRecord(index, type) {
  const mode = type || currentMode;
  getList(mode).splice(index, 1);

  // 修正「編輯中」的索引：目前表單或另一模式暫存表單正在編輯同一份清單時
  const fixEditing = (idx) => {
    if (idx === -1) return { idx: -1, cleared: false };
    if (idx === index) return { idx: -1, cleared: true };
    return { idx: idx > index ? idx - 1 : idx, cleared: false };
  };

  if (mode === currentMode) {
    const cur = parseInt(document.getElementById('editingIndex').value, 10);
    const res = fixEditing(cur);
    if (res.cleared) {
      resetForm();
    } else {
      document.getElementById('editingIndex').value = res.idx;
      updateSubmitBtn();
    }
  } else if (formStash[mode]) {
    const res = fixEditing(parseInt(formStash[mode].editingIndex, 10));
    formStash[mode] = res.cleared ? null : { ...formStash[mode], editingIndex: String(res.idx) };
  }

  renderRecordTable();
  showNotice('exportMsg', tr('已刪除該筆資料', 'Record deleted'));
  updateCancelBtnVisibility();
}

function openGame() {
  if (records.length + hwRecords.length < CONFIG.minRecordsForGame) return;
  window.open(CONFIG.gameUrl, '_blank');
}

// ----------------------------------------------------
// 共用：下載、日期
// ----------------------------------------------------
function getTodayMMDDYYYY() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${mm}${dd}${now.getFullYear()}`;
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ----------------------------------------------------
// 匯出 Excel 範本（軟體 / 硬體 兩個工作表，完整支援動態權重公式）
// ----------------------------------------------------
const MEDIUM_BORDER = {
  top: { style: 'medium', color: { argb: 'FF000000' } },
  left: { style: 'medium', color: { argb: 'FF000000' } },
  bottom: { style: 'medium', color: { argb: 'FF000000' } },
  right: { style: 'medium', color: { argb: 'FF000000' } }
};

// 依據成品 DataCollectionTemplate(曾俊杰)-10192026-2.xlsx 校正之格子 EMU 尺寸與列高：
// ExcelJS 預設字型為 Calibri (1 px = 0.75 pt)，第 1 列需設 ht=38.25 (51*0.75)，在 Excel (120 DPI, 1 px = 0.6 pt) 才會顯示 30.6(51像素)
// 儲存格有效置中範圍為寬 1,985,010 EMUs、高 1,849,756 EMUs（924x541 圖片置中偏移 colOff=92505、rowOff=397930）
const IMG_COL_WIDTH = 32.25;
const HEADER_ROW_HEIGHT = 38.25;
const DATA_ROW_HEIGHT = 191.25;
const CELL_WIDTH_EMU = 1985010;
const CELL_HEIGHT_EMU = 1849756;

function placeCenteredImage5cm(workbook, sheet, img, colIdx, rowIdx) {
  if (!img) return;
  const TARGET_EMU = 5 * 360000; // 5 cm = 1,800,000 EMUs
  const EMU_PER_PX = 9525;       // ExcelJS 內部 1 px = 9525 EMUs
  const origW = img.width || 1;
  const origH = img.height || 1;

  let widthEmu, heightEmu;
  if (origW >= origH) {
    widthEmu = TARGET_EMU;
    heightEmu = Math.round(TARGET_EMU * (origH / origW));
  } else {
    heightEmu = TARGET_EMU;
    widthEmu = Math.round(TARGET_EMU * (origW / origH));
  }

  const nativeColOff = Math.max(0, Math.round((CELL_WIDTH_EMU - widthEmu) / 2));
  const nativeRowOff = Math.max(0, Math.round((CELL_HEIGHT_EMU - heightEmu) / 2));

  const imgId = workbook.addImage({ base64: img.base64, extension: img.ext });
  sheet.addImage(imgId, {
    tl: { nativeCol: colIdx, nativeColOff, nativeRow: rowIdx, nativeRowOff },
    ext: { width: (widthEmu + 0.5) / EMU_PER_PX, height: (heightEmu + 0.5) / EMU_PER_PX },
    editAs: 'oneCell'
  });
}

function buildSoftSheet(workbook, sheet, list) {
  const { w1, w2 } = state;
  const mediumBorder = MEDIUM_BORDER;

  sheet.columns = [
    { key: 'A', width: IMG_COL_WIDTH },
    { key: 'B', width: 32.25 },
    { key: 'C', width: 32.25 },
    { key: 'D', width: 19.75 },
    { key: 'E', width: 18.625 },
    { key: 'F', width: 58.5 },
    { key: 'G', width: 22.625 },
    { key: 'H', width: IMG_COL_WIDTH },
    { key: 'I', width: 19.25 },
    { key: 'J', width: 19.25 },
    { key: 'K', width: 16.75 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = HEADER_ROW_HEIGHT;
  const headerValues = [
    'Generated Image',
    'Chinese',
    'Translated English Text',
    'Distance',
    'Light',
    'GAIText (English)\n(Upload the generated image to generate description texts)',
    'HEGAIText',
    'GAIImage (English)\n(Use the translated English to generate a new image)',
    'HEGAIImage_v1',
    'HEGAIImage_v2',
    'HEGAIImage'
  ];

  headerValues.forEach((val, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = val;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = mediumBorder;

    if ([4, 5, 7, 11].includes(idx + 1)) {
      cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFC00000' } };
    } else if ([6, 8, 9, 10].includes(idx + 1)) {
      cell.font = { name: 'Times New Roman', size: 12, bold: false, color: { argb: 'FF7030A0' } };
    } else {
      cell.font = { name: 'Times New Roman', size: 12, bold: false, color: { argb: 'FF000000' } };
    }
  });

  list.forEach((rec, idx) => {
    const rowNum = idx + 2;
    const row = sheet.getRow(rowNum);
    row.height = DATA_ROW_HEIGHT;

    row.getCell(2).value = rec.chinese;
    row.getCell(2).font = { name: '標楷體', size: 12, bold: false, color: { argb: 'FF000000' } };

    row.getCell(3).value = rec.engText;
    row.getCell(3).font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF7030A0' } };

    row.getCell(4).value = rec.distance;
    row.getCell(4).font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFC00000' } };

    row.getCell(5).value = rec.light;
    row.getCell(5).font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFC00000' } };

    row.getCell(6).value = rec.gaiText;
    row.getCell(6).font = { name: 'Times New Roman', size: 12, bold: false, color: { argb: 'FF7030A0' } };

    row.getCell(7).value = rec.hegaiText;
    row.getCell(7).font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFC00000' } };

    row.getCell(9).value = rec.v1;
    row.getCell(9).font = { name: 'Times New Roman', size: 12, bold: false, color: { argb: 'FF7030A0' } };

    row.getCell(10).value = rec.v2;
    row.getCell(10).font = { name: 'Times New Roman', size: 12, bold: false, color: { argb: 'FF7030A0' } };

    const cellK = row.getCell(11);
    cellK.value = { formula: `${w1}*I${rowNum}+${w2}*J${rowNum}`, result: rec.finalScore };
    cellK.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFC00000' } };

    for (let col = 1; col <= 11; col++) {
      const c = row.getCell(col);
      c.border = mediumBorder;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    placeCenteredImage5cm(workbook, sheet, rec.img1, 0, rowNum - 1);
    placeCenteredImage5cm(workbook, sheet, rec.img2, 7, rowNum - 1);
  });

  sheet.eachRow((row, rowNumber) => {
    row.height = (rowNumber === 1) ? HEADER_ROW_HEIGHT : DATA_ROW_HEIGHT;
  });
}

// 硬體：格式對照 DataCollectionTemplate (hardware).xlsx 與成品圖片格設定
function buildHardSheet(workbook, sheet, list) {
  const { w1, w2 } = state;
  const TNR = 'Times New Roman';
  const BLACK = 'FF000000';
  const RED = 'FFC00000';
  const PURPLE = 'FF7030A0';

  sheet.columns = [
    { key: 'A', width: IMG_COL_WIDTH },
    { key: 'B', width: 15.33 },
    { key: 'C', width: 14.58 },
    { key: 'D', width: 32.25 },
    { key: 'E', width: 32.25 },
    { key: 'F', width: 20.63 },
    { key: 'G', width: IMG_COL_WIDTH },
    { key: 'H', width: 19.63 },
    { key: 'I', width: 19.63 },
    { key: 'J', width: 23.25 }
  ];

  // 每欄樣式：[header 字型, 資料 字型, 全部置中]
  const f12 = (color, bold = false) => ({ name: TNR, size: 12, bold, color: { argb: color } });
  const f16 = (color) => ({ name: TNR, size: 16, bold: true, color: { argb: color } });
  const colStyles = [
    { head: f12(BLACK),  data: f12(BLACK) },                                           // A
    { head: f16(RED),    data: f16(RED) },                                             // B Distance
    { head: f16(RED),    data: f16(RED) },                                             // C Light
    { head: f12(PURPLE), data: { name: '標楷體', size: 10, color: { argb: PURPLE } } }, // D GAIText (Chinese)
    { head: f12(PURPLE), data: { name: TNR, size: 10, color: { argb: PURPLE } } },     // E GAIText (English)
    { head: f16(RED),    data: f16(RED) },                                             // F HEGAIText
    { head: f12(BLACK),  data: f12(BLACK) },                                           // G GAIImage
    { head: f12(PURPLE), data: f12(PURPLE) },                                          // H v1
    { head: f12(PURPLE), data: f12(PURPLE) },                                          // I v2
    { head: f16(RED),    data: f16(RED) }                                              // J HEGAIImage
  ];

  const headerValues = [
    'Image No.(Shooting Image)',
    'Distance',
    'Light',
    'GAIText (Chinese)',
    'GAIText (English)\n(Use English to generate a new image)',
    'HEGAIText',
    'GAIImage',
    'HEGAIImage_v1',
    'HEGAIImage_v2',
    'HEGAIImage'
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = HEADER_ROW_HEIGHT;
  headerValues.forEach((val, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = val;
    cell.font = colStyles[idx].head;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = MEDIUM_BORDER;
  });

  list.forEach((rec, idx) => {
    const rowNum = idx + 2;
    const row = sheet.getRow(rowNum);
    row.height = DATA_ROW_HEIGHT;

    row.getCell(2).value = rec.distance;
    row.getCell(3).value = rec.light;
    row.getCell(4).value = rec.gaiTextCn || '';
    row.getCell(5).value = rec.gaiText;
    row.getCell(6).value = rec.hegaiText;
    row.getCell(8).value = rec.v1;
    row.getCell(9).value = rec.v2;
    row.getCell(10).value = { formula: `${w1}*H${rowNum}+${w2}*I${rowNum}`, result: rec.finalScore };

    for (let col = 1; col <= 10; col++) {
      const c = row.getCell(col);
      c.font = colStyles[col - 1].data;
      c.border = MEDIUM_BORDER;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    placeCenteredImage5cm(workbook, sheet, rec.img1, 0, rowNum - 1);
    placeCenteredImage5cm(workbook, sheet, rec.img2, 6, rowNum - 1);
  });

  sheet.eachRow((row, rowNumber) => {
    row.height = (rowNumber === 1) ? HEADER_ROW_HEIGHT : DATA_ROW_HEIGHT;
  });
}

async function exportAllXLSX() {
  if (!validateStep0('exportMsg')) return;

  const tplModeElem = document.querySelector('input[name="templateMode"]:checked');
  const tplMode = tplModeElem ? tplModeElem.value : 'both';

  let countToExport = 0;
  if (tplMode === 'soft') {
    countToExport = records.length;
    if (countToExport === 0) {
      showNotice('exportMsg', tr('⚠️ 軟體資料模型清單中尚無任何資料可以匯出！', '⚠️ No records in the Software Data Model list to export!'), true);
      return;
    }
  } else if (tplMode === 'hard') {
    countToExport = hwRecords.length;
    if (countToExport === 0) {
      showNotice('exportMsg', tr('⚠️ 硬體資料模型清單中尚無任何資料可以匯出！', '⚠️ No records in the Hardware Data Model list to export!'), true);
      return;
    }
  } else {
    countToExport = records.length + hwRecords.length;
    if (countToExport === 0) {
      showNotice('exportMsg', tr('⚠️ 清單中尚無任何資料可以匯出！', '⚠️ No records in the list to export!'), true);
      return;
    }
  }

  const btn = document.getElementById('exportBtn');
  btn.disabled = true;
  btn.innerText = tr(`正在產生 ${countToExport} 筆資料之 Excel...`, `Generating Excel for ${countToExport} record(s)...`);

  try {
    const workbook = new ExcelJS.Workbook();
    if (tplMode === 'both') {
      buildSoftSheet(workbook, workbook.addWorksheet(tr('軟體', 'Software')), records);
      buildHardSheet(workbook, workbook.addWorksheet(tr('硬體', 'Hardware')), hwRecords);
    } else if (tplMode === 'soft') {
      buildSoftSheet(workbook, workbook.addWorksheet(tr('工作表1', 'Sheet 1')), records);
    } else if (tplMode === 'hard') {
      buildHardSheet(workbook, workbook.addWorksheet(tr('工作表1', 'Sheet 1')), hwRecords);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    exportCount++;
    const userName = document.getElementById('userName').value.trim() || tr('未命名', 'Unnamed');
    downloadBuffer(buffer, `DataCollectionTemplate(${userName})-${getTodayMMDDYYYY()}-${exportCount}.xlsx`);

    const summary = tplMode === 'soft'
      ? tr(`軟體 ${records.length} 筆`, `Software: ${records.length}`)
      : tplMode === 'hard'
        ? tr(`硬體 ${hwRecords.length} 筆`, `Hardware: ${hwRecords.length}`)
        : tr(`軟體 ${records.length} 筆、硬體 ${hwRecords.length} 筆`, `Software: ${records.length}, Hardware: ${hwRecords.length}`);
    showNotice('exportMsg', tr(`🎉 Excel 檔案已成功下載！（${summary}）`, `🎉 Excel file downloaded! (${summary})`));
  } catch (err) {
    showNotice('exportMsg', tr('匯出失敗：', 'Export failed: ') + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerText = tr('⬇️ 匯出資料模型範本(.xlsx)', '⬇️ Export Data Model Template (.xlsx)');
  }
}

// ----------------------------------------------------
// 匯出資料模型 (.xlsx)：把收集清單合併進 DataCollection(Stage 1).xlsx
// ----------------------------------------------------
const STAGE1_FILENAME = 'DataCollection(Stage 1).xlsx';
let modelExportCount = 0;

// 取得 Stage 1 原始檔：先嘗試同資料夾讀取（需透過 http/https，如 GitHub Pages），失敗則讓使用者手動選檔
async function getStage1Buffer() {
  try {
    const res = await fetch(encodeURI(STAGE1_FILENAME), { cache: 'no-store' });
    if (res.ok) return await res.arrayBuffer();
  } catch (e) { /* file:// 或網路錯誤時改用手動選檔 */ }

  return new Promise((resolve, reject) => {
    const input = document.getElementById('stage1FileInput');
    input.value = '';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return reject(new Error(tr('未選擇檔案', 'No file selected')));
      resolve(await f.arrayBuffer());
    };
    input.oncancel = () => reject(new Error(tr('已取消選擇 Stage 1 檔案', 'Cancelled selecting Stage 1 file')));
    showNotice('exportMsg', tr(`ℹ️ 無法自動讀取 ${STAGE1_FILENAME}，請手動選擇該檔案。`, `ℹ️ Unable to load ${STAGE1_FILENAME} automatically. Please select the file manually.`));
    input.click();
  });
}

// 將公式中屬於 fromRow 的儲存格參照改成 toRow（例如 C146*0.7+D146*0.3 → C150*0.7+D150*0.3）
function shiftFormulaRow(formula, fromRow, toRow) {
  return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (m, col, d, row) =>
    Number(row) === fromRow ? `${col}${d}${toRow}` : m);
}

async function exportModelXLSX() {
  if (!validateStep0('exportMsg')) return;

  // 軟體與硬體資料都合併（先軟體、後硬體）
  const allRecords = [...records, ...hwRecords];
  if (allRecords.length === 0) {
    showNotice('exportMsg', tr('⚠️ 清單中尚無任何資料可以匯出！', '⚠️ No records in the list to export!'), true);
    return;
  }

  const btn = document.getElementById('exportModelBtn');
  btn.disabled = true;
  btn.innerText = tr('正在產生資料模型...', 'Generating Data Model...');

  try {
    const buffer = await getStage1Buffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    sheet.name = tr('工作表1', 'Sheet 1');

    // 1. 找出最後一列有資料的 row（原檔預先格式化到 1000 列）
    let lastRow = 1;
    for (let r = sheet.rowCount; r >= 2; r--) {
      const row = sheet.getRow(r);
      const hasData = [1, 2, 3, 4].some(c => {
        const v = row.getCell(c).value;
        return v !== null && v !== undefined && v !== '';
      });
      if (hasData) { lastRow = r; break; }
    }

    // 2. 讀取既有資料與 GAIFit 公式
    const baseFont = JSON.parse(JSON.stringify(sheet.getRow(2).getCell(1).font || {}));
    const readFit = (r) => {
      const c = sheet.getRow(r).getCell(5);
      if (typeof c.formula === 'string' && c.formula) {
        return { formula: c.formula, origRow: r, result: c.result };
      }
      const v = c.value;
      return (v === null || v === undefined || v === '') ? null : { constant: v };
    };

    const items = [];
    for (let r = 2; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      items.push({
        isNew: false,
        vals: [1, 2, 3, 4].map(c => row.getCell(c).value),
        fit: readFit(r)
      });
    }

    // 3. 準備新資料 (Distance, Light, HEGAIText, HEGAIImage)
    const newItems = allRecords.map(rec => ({
      isNew: true,
      vals: [
        rec.distance,
        rec.light,
        rec.hegaiText,
        Number((state.w1 * Number(rec.v1) + state.w2 * Number(rec.v2)).toFixed(1))
      ],
      fit: null
    }));

    const mode = document.querySelector('input[name="mergeMode"]:checked').value;
    let firstChanged;
    if (mode === 'random') {
      newItems.forEach(it => {
        const pos = Math.floor(Math.random() * (items.length + 1));
        items.splice(pos, 0, it);
      });
      firstChanged = 0;
    } else if (mode === 'prepend') {
      // 依序附加在頂端：第 1 筆在第 2 列、第 2 筆在第 3 列…，原有資料整體往下移
      items.unshift(...newItems);
      firstChanged = 0;
    } else {
      firstChanged = items.length;
      items.push(...newItems);
    }

    // 4. 寫回工作表；新 row 紅字，GAIFit 套用 C*0.7+D*0.3
    const redFont = { ...baseFont, color: { argb: 'FFFF0000' } };
    for (let i = firstChanged; i < items.length; i++) {
      const rowNum = i + 2;
      const item = items[i];
      const row = sheet.getRow(rowNum);

      item.vals.forEach((v, idx) => { row.getCell(idx + 1).value = v; });

      const fitCell = row.getCell(5);
      let fit = item.fit;
      if (item.isNew) {
        // 新資料列：GAIFit = C*0.7 + D*0.3，並寫入計算結果（避免檢視器未重算而顯示空白）
        const c = Number(item.vals[2]);
        const d = Number(item.vals[3]);
        fitCell.value = { formula: `C${rowNum}*0.7+D${rowNum}*0.3`, result: c * 0.7 + d * 0.3 };
        item.fit = { formula: `C${rowNum}*0.7+D${rowNum}*0.3`, origRow: rowNum };
        for (let col = 1; col <= 5; col++) {
          const cell = row.getCell(col);
          cell.style = { ...cell.style, font: { ...redFont } };
        }
        row.commit();
        continue;
      }
      if (fit && fit.formula) {
        const f = shiftFormulaRow(fit.formula, fit.origRow, rowNum);
        fitCell.value = { formula: f };
        // 保留既有資料原本的快取結果
        if (fit.result !== undefined) fitCell.value = { formula: f, result: fit.result };
        item.fit = { formula: f, origRow: rowNum, result: fit.result };
      } else if (fit && fit.constant !== undefined) {
        fitCell.value = fit.constant;
      } else {
        fitCell.value = null;
      }

      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.style = { ...cell.style, font: { ...baseFont } };
      }
      row.commit();
    }

    workbook.calcProperties.fullCalcOnLoad = true;

    // 5. 下載
    const out = await workbook.xlsx.writeBuffer();
    modelExportCount++;
    const userName = document.getElementById('userName').value.trim() || tr('未命名', 'Unnamed');
    downloadBuffer(out, `DataCollection(${userName})-${getTodayMMDDYYYY()}-${modelExportCount}.xlsx`);
    const modeLabel = tr(
      { random: '隨機排列', prepend: '依序附加在頂端', append: '依序附加在底部' }[mode],
      { random: 'Random Order', prepend: 'Prepend to Top', append: 'Append to Bottom' }[mode]
    );
    showNotice(
      'exportMsg',
      tr(
        `🎉 資料模型已下載（新增 ${newItems.length} 筆：軟體 ${records.length}、硬體 ${hwRecords.length}，${modeLabel}）！`,
        `🎉 Data model downloaded (Added ${newItems.length}: Software ${records.length}, Hardware ${hwRecords.length}, ${modeLabel})!`
      )
    );
  } catch (err) {
    showNotice('exportMsg', tr('匯出失敗：', 'Export failed: ') + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerText = tr('📊 匯出資料模型(.xlsx)', '📊 Export Data Model (.xlsx)');
  }
}
