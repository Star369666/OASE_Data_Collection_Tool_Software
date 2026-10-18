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
let currentImages = { currImg1: null, currImg2: null };
let exportCount = 0;

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
  applyModeUI();

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
// 軟體 / 硬體 模式切換
// ----------------------------------------------------
function applyModeUI() {
  document.body.setAttribute('data-mode', currentMode);
  document.querySelectorAll('.mode-btn').forEach(b => {
    const on = b.dataset.mode === currentMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-soft][data-hard]').forEach(el => {
    el.textContent = el.dataset[currentMode === 'hard' ? 'hard' : 'soft'];
  });
  document.querySelectorAll('[data-ph-soft][data-ph-hard]').forEach(el => {
    el.placeholder = currentMode === 'hard' ? el.dataset.phHard : el.dataset.phSoft;
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
  document.getElementById('genImageInput').value = '';
  document.getElementById('gaiImageInput').value = '';
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
    : '[無圖]';
}

function actionCell(i, type) {
  return `
        <td>
          <button class="btn-edit" onclick="editRecord(${i}, '${type}')">編輯</button>
          <button class="btn-danger" onclick="deleteRecord(${i}, '${type}')">刪除</button>
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
  document.getElementById('softCount').innerText = `${s} 筆`;
  document.getElementById('hardCount').innerText = `${h} 筆`;
  document.getElementById('listCount').innerText = `${total} 筆`;
  document.getElementById('tabListCount').innerText = total;

  // 小遊戲按鈕判定 (達門檻解鎖)
  const gameBtn = document.getElementById('gameLinkBtn');
  const gameStatus = document.getElementById('gameLockStatus');
  if (gameBtn && gameStatus) {
    if (total >= CONFIG.minRecordsForGame) {
      gameBtn.disabled = false;
      gameBtn.innerText = '🎮 前往小遊戲';
      gameStatus.innerText = '（已解鎖！）';
      gameStatus.style.color = '#15803d';
    } else {
      gameBtn.disabled = true;
      gameBtn.innerText = '🔒 尚未解鎖';
      gameStatus.innerText = `（再收集 ${CONFIG.minRecordsForGame - total} 筆即可解鎖）`;
      gameStatus.style.color = '#86198f';
    }
  }

  // 軟體
  softBody.innerHTML = s === 0
    ? '<tr><td colspan="13" class="empty-row">目前尚無已暫存的資料</td></tr>'
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
    ? '<tr><td colspan="12" class="empty-row">目前尚無已暫存的資料</td></tr>'
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
// 輸入防呆與同步
// ----------------------------------------------------
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
    showNotice(msgElemId, '⚠️ 請先在最上方填寫「你的名字」！', true);
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
  if (tabId !== 'tab-list') lastStep[currentMode] = [tabId, btnId];
  updateCancelBtnVisibility();
}

function goBackTo(tabId, btnId) {
  switchTab(tabId, btnId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startNewRecord(mode) {
  if (!validateStep0('exportMsg')) return;
  if (mode && mode !== currentMode) setMode(mode);
  resetForm();
  switchTab('tab-Step1', 'btn-tab1');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelToTab4() {
  resetForm();
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
  document.getElementById('submitBtn').innerText =
    idx === -1 ? '💾 儲存並前往收集清單' : `💾 儲存修改 (第 ${idx + 1} 筆)`;
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
    showNotice('Step1Msg', '⚠️ 請務必填寫「中文語句」與「翻譯英文句子」！', true);
    return;
  }
  if (!currentImg1) {
    showNotice('Step1Msg', isHard
      ? '⚠️ 請先上傳拍攝圖片 (Shooting Image)！'
      : '⚠️ 請先上傳第1張生成圖片 (Generated Image)！', true);
    return;
  }
  if (!isValidNumber(distanceVal, 0, 255) || !isValidNumber(lightVal, 0, 4000)) {
    showNotice('Step1Msg', '⚠️ 請確實填寫或滑動設定「Distance」與「Light」數值！', true);
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
      ? '⚠️ 請輸入 GAIText (English) 描述文字！'
      : '⚠️ 請輸入 GAIText (反向生成的英文描述)！', true);
    return;
  }
  if (!isValidNumber(hegaiTextVal, 0, 10)) {
    showNotice('Step2Msg', '⚠️ 請設定 HEGAIText 評分！', true);
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
          height: img.naturalHeight
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
  }
}

// 依 currentImages 與欄位內容重新整理各步驟的圖片/文字預覽
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
  const t = document.getElementById('gaiText').value.trim();
  document.getElementById('Step3-ref-text').innerText = t || '（尚未輸入文字）';
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
    showNotice('actionMsg', '⚠️ 請完成第2張圖片的上傳後再新增！', true);
    return;
  }
  
  const v1Val = document.getElementById('v1').value;
  const v2Val = document.getElementById('v2').value;
  if (!isValidNumber(v1Val, 0, 10) || !isValidNumber(v2Val, 0, 10)) {
    showNotice('actionMsg', '⚠️ 請設定 HEGAIImage_v1 與 v2 評分！', true);
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

  const label = mode === 'hard' ? '硬體' : '軟體';
  if (editingIdx === -1) {
    list.push(record);
    showNotice('exportMsg', `✅ 已成功新增一筆${label}資料！`, false);
  } else {
    list[editingIdx] = record;
    document.getElementById('editingIndex').value = '-1';
    updateSubmitBtn();
    showNotice('exportMsg', `✅ ${label}第 ${editingIdx + 1} 筆資料已更新！`, false);
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
  document.getElementById('genImageInput').value = '';
  document.getElementById('gaiImageInput').value = '';
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
  showNotice('exportMsg', '已刪除該筆資料');
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

function buildSoftSheet(workbook, sheet, list) {
  const { w1, w2 } = state;
  const mediumBorder = MEDIUM_BORDER;

  sheet.columns = [
    { key: 'A', width: 32.25 },
    { key: 'B', width: 13.0 },
    { key: 'C', width: 13.0 },
    { key: 'D', width: 19.75 },
    { key: 'E', width: 18.66 },
    { key: 'F', width: 47.08 },
    { key: 'G', width: 22.66 },
    { key: 'H', width: 26.25 },
    { key: 'I', width: 15.08 },
    { key: 'J', width: 16.66 },
    { key: 'K', width: 15.41 }
  ];

  const headerRow = sheet.getRow(1);
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

    const TARGET_PX = 151; 
    const cellH_PX = 255;
    
    if (rec.img1) {
      const cellW1_PX = 230;
      const fit1 = calculateFitDimensions(rec.img1.width, rec.img1.height, TARGET_PX, TARGET_PX);
      const offsetX1 = ((cellW1_PX - fit1.width) / 2) / cellW1_PX;
      const offsetY1 = ((cellH_PX - fit1.height) / 2) / cellH_PX;

      const imgId1 = workbook.addImage({ base64: rec.img1.base64, extension: rec.img1.ext });
      sheet.addImage(imgId1, {
        tl: { col: 0 + offsetX1, row: (rowNum - 1) + offsetY1 },
        ext: { width: fit1.width, height: fit1.height },
        editAs: 'oneCell'
      });
    }

    if (rec.img2) {
      const cellW2_PX = 188;
      const fit2 = calculateFitDimensions(rec.img2.width, rec.img2.height, TARGET_PX, TARGET_PX);
      const offsetX2 = ((cellW2_PX - fit2.width) / 2) / cellW2_PX;
      const offsetY2 = ((cellH_PX - fit2.height) / 2) / cellH_PX;

      const imgId2 = workbook.addImage({ base64: rec.img2.base64, extension: rec.img2.ext });
      sheet.addImage(imgId2, {
        tl: { col: 7 + offsetX2, row: (rowNum - 1) + offsetY2 },
        ext: { width: fit2.width, height: fit2.height },
        editAs: 'oneCell'
      });
    }
  });

  sheet.eachRow((row, rowNumber) => {
    row.height = (rowNumber === 1) ? 47 : 191.25;
  });
}

// 硬體：格式對照 DataCollectionTemplate (hardware).xlsx
function buildHardSheet(workbook, sheet, list) {
  const { w1, w2 } = state;
  const TNR = 'Times New Roman';
  const BLACK = 'FF000000';
  const RED = 'FFC00000';
  const PURPLE = 'FF7030A0';

  sheet.columns = [
    { key: 'A', width: 30.66 },
    { key: 'B', width: 15.33 },
    { key: 'C', width: 14.58 },
    { key: 'D', width: 14.58 },
    { key: 'E', width: 22.66 },
    { key: 'F', width: 17.66 },
    { key: 'G', width: 29.0 },
    { key: 'H', width: 15.08 },
    { key: 'I', width: 16.66 },
    { key: 'J', width: 18.25 }
  ];

  // 每欄樣式：[header 字型, 資料 字型, 資料 水平對齊]
  const f12 = (color, bold = false) => ({ name: TNR, size: 12, bold, color: { argb: color } });
  const f16 = (color) => ({ name: TNR, size: 16, bold: true, color: { argb: color } });
  const colStyles = [
    { head: f12(BLACK),        data: f12(BLACK),                                                  align: 'center' }, // A
    { head: f16(RED),          data: f16(RED),                                                    align: 'center' }, // B Distance
    { head: f16(RED),          data: f16(RED),                                                    align: 'center' }, // C Light
    { head: f12(PURPLE),       data: { name: '標楷體', size: 10, color: { argb: PURPLE } },        align: 'left' },   // D GAIText (Chinese)
    { head: f12(PURPLE),       data: { name: TNR, size: 10, color: { argb: PURPLE } },            align: 'left' },   // E GAIText (English)
    { head: f16(RED),          data: f16(RED),                                                    align: 'center' }, // F HEGAIText
    { head: f12(BLACK),        data: f12(BLACK),                                                  align: 'center' }, // G GAIImage
    { head: f12(PURPLE),       data: f12(PURPLE),                                                 align: 'center' }, // H v1
    { head: f12(PURPLE),       data: f12(PURPLE),                                                 align: 'center' }, // I v2
    { head: f16(RED),          data: f16(RED),                                                    align: 'center' }  // J HEGAIImage
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
  headerValues.forEach((val, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = val;
    cell.font = colStyles[idx].head;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = MEDIUM_BORDER;
  });

  const CELL_H_PX = 255;
  const COL_A_PX = 220;
  const COL_G_PX = 208;
  const MAX_H_PX = 235;

  list.forEach((rec, idx) => {
    const rowNum = idx + 2;
    const row = sheet.getRow(rowNum);

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
      c.alignment = { horizontal: colStyles[col - 1].align, vertical: 'middle', wrapText: true };
    }

    const placeImage = (img, colIdx, colPx) => {
      if (!img) return;
      const fit = calculateFitDimensions(img.width, img.height, colPx - 16, MAX_H_PX);
      const offX = ((colPx - fit.width) / 2) / colPx;
      const offY = ((CELL_H_PX - fit.height) / 2) / CELL_H_PX;
      const id = workbook.addImage({ base64: img.base64, extension: img.ext });
      sheet.addImage(id, {
        tl: { col: colIdx + offX, row: (rowNum - 1) + offY },
        ext: { width: fit.width, height: fit.height },
        editAs: 'oneCell'
      });
    };
    placeImage(rec.img1, 0, COL_A_PX);
    placeImage(rec.img2, 6, COL_G_PX);
  });

  sheet.eachRow((row, rowNumber) => {
    row.height = (rowNumber === 1) ? 49.5 : 191.25;
  });
}

async function exportAllXLSX() {
  if (!validateStep0('exportMsg')) return;

  const total = records.length + hwRecords.length;
  if (total === 0) {
    showNotice('exportMsg', '⚠️ 清單中尚無任何資料可以匯出！', true);
    return;
  }

  const btn = document.getElementById('exportBtn');
  btn.disabled = true;
  btn.innerText = `正在產生 ${total} 筆資料之 Excel...`;

  try {
    const workbook = new ExcelJS.Workbook();
    buildSoftSheet(workbook, workbook.addWorksheet('軟體'), records);
    buildHardSheet(workbook, workbook.addWorksheet('硬體'), hwRecords);

    const buffer = await workbook.xlsx.writeBuffer();

    exportCount++;
    const userName = document.getElementById('userName').value.trim() || '未命名';
    downloadBuffer(buffer, `DataCollectionTemplate(${userName})-${getTodayMMDDYYYY()}-${exportCount}.xlsx`);
    showNotice('exportMsg', `🎉 Excel 檔案已成功下載！（軟體 ${records.length} 筆、硬體 ${hwRecords.length} 筆）`);
  } catch (err) {
    showNotice('exportMsg', '匯出失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerText = '⬇️ 匯出資料模型範本(.xlsx)';
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
      if (!f) return reject(new Error('未選擇檔案'));
      resolve(await f.arrayBuffer());
    };
    input.oncancel = () => reject(new Error('已取消選擇 Stage 1 檔案'));
    showNotice('exportMsg', `ℹ️ 無法自動讀取 ${STAGE1_FILENAME}，請手動選擇該檔案。`);
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
    showNotice('exportMsg', '⚠️ 清單中尚無任何資料可以匯出！', true);
    return;
  }

  const btn = document.getElementById('exportModelBtn');
  const oldText = btn.innerText;
  btn.disabled = true;
  btn.innerText = '正在產生資料模型...';

  try {
    const buffer = await getStage1Buffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

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
    const userName = document.getElementById('userName').value.trim() || '未命名';
    downloadBuffer(out, `DataCollection(${userName})-${getTodayMMDDYYYY()}-${modelExportCount}.xlsx`);
    const modeLabel = { random: '隨機排列', prepend: '依序附加在頂端', append: '依序附加在底部' }[mode];
    showNotice('exportMsg', `🎉 資料模型已下載（新增 ${newItems.length} 筆：軟體 ${records.length}、硬體 ${hwRecords.length}，${modeLabel}）！`);
  } catch (err) {
    showNotice('exportMsg', '匯出失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerText = oldText;
  }
}
