# QCI&AI 資料模型蒐集工具 (QCI&AI Data Model Collection Tool)

本工具為 **OASE Lab.** 開發之網頁端互動式資料蒐集與評估系統，搭配 [KWS AI 平台](https://kws.oaselab.org/) 進行 **QCI&AI 資料模型（軟體）** 與 **QCI&AI 資料模型（硬體）** 的多模態（語音／文字／影像）生成、人工評估（Human Evaluation）及 Excel 報表匯出。

---

## ✨ 功能特色 (Key Features)

1. **雙資料模型獨立蒐集（軟體／硬體模式）**
   - **QCI&AI 資料模型（軟體）**：語音輸入生成圖片（Generated Image）$\rightarrow$ 圖生文（GAIText）$\rightarrow$ 文生圖（GAIImage）。
   - **QCI&AI 資料模型（硬體）**：上傳硬體學習工具拍攝圖片（Shooting Image）$\rightarrow$ 圖生文（GAIText 中／英文）$\rightarrow$ 文生圖（GAIImage）。
   - 軟、硬體模式各自擁有獨立的暫存表單與圖片檔名記憶，在 Step 1～Step 3 之間切換模式時互不覆蓋；一旦進入「收集清單」分頁，系統會自動清空當前模式的暫存表單，亦提供「🗑️ 清空軟體和硬體暫存表格」按鈕一鍵重置。
2. **中／英文雙語介面切換（左上角）**
   - 左上角提供 `中文` / `English` 單選切換鈕，即時切換全站介面文字、提示訊息與匯出工作表名稱（底部作者與版權資訊維持中英並陳）。
3. **三種顯示主題模式（右上角）**
   - 右上角提供 `☀️ 亮色 (Light)`、`🌙 深色 (Dark)`、`☁️ 灰色 (Gray)` 三種主題單選鈕，並自動記憶於瀏覽器 `localStorage`。
4. **動態權重設定與即時重算**
   - 可透過滑桿或數字輸入框調整 **HEGAIImage 權重**（圖圖相符 $w_1$ vs. 圖文相符 $w_2$，$w_1 + w_2 = 100\%$）。
   - 調整權重時，Step 3 預覽分數與「收集清單」內所有已收集資料的 `HEGAIImage` 分數皆會即時重新計算。
5. **嚴格數值輸入防呆機制**
   - 針對 **圖圖相符權重 (`0–100`)**、**Distance (`0–255`)**、**Light (`0–4000`)**、**HEGAIText (`0–10`)**、**HEGAIImage_v1 (`0–10`)**、**HEGAIImage_v2 (`0–10`)** 六個數值輸入框：
     1. **阻擋非數字字元**：無法輸入任何英文字母、負號或標點符號（如 `!`、`@`、`#`、`-`、`+`、`.`、`e` 等）。
     2. **超出範圍自動填入最大值**：按下數字後若超出該欄位上限（例如 Distance 已輸入 `25` 再按 `6`），系統會自動填入最大值 `255` 並同步滑桿。
     3. **達最大值時鎖定輸入**：當數值已為最大值（如 `255`、`4000`、`100`、`10`）時，不再接受額外數字輸入，需先按 `Backspace` / `Delete` 刪除後方可重新輸入。
6. **雙軌 Excel (`.xlsx`) 報表匯出**
   - **② 匯出收集範本 (`DataCollectionTemplate`)**：
     - 可選擇「匯出軟體和硬體資料模型範本」、「匯出軟體資料模型範本」或「匯出硬體資料模型範本」。
     - 自動將上傳圖片以最長邊 **5 cm** 等比例縮放並置中嵌入對應儲存格，且在 `HEGAIImage` 欄位寫入動態加權公式。
   - **③ 匯出資料模型最終檔案 (`DataCollection`)**：
     - 將已收集之軟體與硬體資料合併至 OASE Lab. 團隊專家資料檔 `DataCollection(Stage 1).xlsx`。
     - 支援「依序附加在頂端」、「依序附加在底部」、「隨機排列」三種合併模式；新增資料列以**紅色字體**標示，並自動套用 `GAIFit = HEGAIText * 0.7 + HEGAIImage * 0.3` 公式。

---

## 🚀 操作流程說明 (Step-by-Step Guide)

### 第 0 步：全域基本設定（畫面頂端藍色區塊）
1. **你的名字 (Your Name)**：請先輸入您的姓名（必填，作為匯出 Excel 檔名標識，例如 `DataCollectionTemplate(王小明)-MMDDYYYY-1.xlsx`）。
2. **HEGAIImage 權重設定**：
   - 拖曳滑桿或於「圖圖相符權重」輸入框輸入 `0–100` 的整數，設定圖圖相符（$w_1$）與圖文相符（$w_2 = 1 - w_1$）的比重（預設各 `50%`）。

### 模式選擇：軟體 vs. 硬體
於分頁上方點擊按鈕切換目前要蒐集的資料模型類型：
- **QCI&AI資料模型(軟體)**
- **QCI&AI資料模型(硬體)**

---

### Step 1：圖片準備與環境參數評估
- **軟體模式（KWS AI 語音輸入生成圖片 與 Distance/Light 評估）**：
  1. 點擊連結前往 [KWS AI (Text/Voice to Image)](https://kws.oaselab.org/kws-ai/text-to-image/) 進行語音輸入並生成圖片，將圖片下載至電腦。
  2. 填寫 **Chinese**（中文原句）與 **Translated English Text**（翻譯英文句子）。
  3. 於「上傳生成圖片」選擇剛下載的圖片（Generated Image）。
  4. 透過滑桿或數字框設定 **Distance**（拍攝距離評估，`0–255 cm`）與 **Light**（環境亮度評估，`0–4000 lux`）。
- **硬體模式（上傳拍攝圖片 與 Distance/Light 評估）**：
  1. 於「上傳拍攝圖片」選擇以 QCI&AI 硬體學習工具拍攝的圖片（Shooting Image）。
  2. 透過滑桿或數字框設定 **Distance**（`0–255 cm`）與 **Light**（`0–4000 lux`）。
- 點擊「**下一步：前往 Step 2 ➡️**」。

---

### Step 2：KWS AI 圖片生成文字描述 與 HEGAIText 評估
1. 點擊連結前往 [KWS AI (Image to Text/Voice)](https://kws.oaselab.org/kws-ai/image-to-text/)，上傳 Step 1 的圖片（Generated Image 或 Shooting Image），使用模型 **Llama 3.2 / Gemma 4** 生成描述文字。
2. 填寫描述文字：
   - **硬體模式**可額外記錄 **GAIText (Chinese)**（中文描述文字）與必填之 **GAIText (English)**（英文描述文字）。
   - **軟體模式**填寫 **GAIText (English or Chinese)**。
3. 設定 **HEGAIText**（評估 GAIText 與圖片的相符程度，`0–10 分`）。
4. 點擊「**下一步：前往 Step 3 ➡️**」。

---

### Step 3：文字描述生成圖片 與 HEGAIImage 評估
1. 點擊連結再次前往 [KWS AI (Text/Voice to Image)](https://kws.oaselab.org/kws-ai/text-to-image/)，輸入 Step 2 的圖片描述文字 **GAIText (English)** 生成新圖片 **GAIImage** 並下載。
2. 於 **GAIImage** 欄位上傳該張新生成的圖片。
3. 進行兩項相符程度評估（畫面提供左右並排對照視窗）：
   - **HEGAIImage_v1 (`0–10 分`)**：評估第一張圖（Generated Image / Shooting Image）與 **GAIImage** 的圖圖相符程度。
   - **HEGAIImage_v2 (`0–10 分`)**：評估 **GAIText (English)** 與 **GAIImage** 的圖文相符程度。
4. 下方會即時顯示加權後的 **HEGAIImage** 分數：
   $$\text{HEGAIImage} = \text{round}(w_1 \times \text{HEGAIImage\_v1} + w_2 \times \text{HEGAIImage\_v2},\ 1)$$
5. 點擊「**💾 儲存並前往收集清單**」。

---

### 收集清單 (Collection List)
進入「收集清單」後，您可以檢視目前軟、硬體各自的筆數統計與完整資料表，並執行以下操作：

- **編輯／刪除單筆資料**：點擊各列左側的「編輯」可載入該筆資料回 Step 1 修改；點擊「刪除」可移除該筆資料。
- **① 收集資料**：
  - `＋ 繼續收集軟體資料`：切換至軟體模式 Step 1 新增下一筆。
  - `＋ 繼續收集硬體資料`：切換至硬體模式 Step 1 新增下一筆。
  - `🗑️ 清空軟體和硬體暫存表格`：清空軟、硬體 Step 1～Step 3 尚未儲存的暫存表單內容。
- **② 匯出收集範本**：
  - 單選鈕可選擇：
    - `匯出軟體和硬體資料模型範本`（工作表名稱：中文版為 `軟體`、`硬體`；英文版為 `Software`、`Hardware`）
    - `匯出軟體資料模型範本`（工作表名稱：中文版為 `工作表1`；英文版為 `Sheet 1`）
    - `匯出硬體資料模型範本`（工作表名稱：中文版為 `工作表1`；英文版為 `Sheet 1`）
  - 點擊「**⬇️ 匯出資料模型範本(.xlsx)**」即可下載包含置中圖片與公式之 Excel 範本檔。
- **③ 匯出資料模型最終檔案（加入 OASE Lab. 團隊專家資料）**：
  - 單選鈕可選擇合併順序：`依序附加在頂端`（預設）、`依序附加在底部`、`隨機排列`。
  - 點擊「**📊 匯出資料模型(.xlsx)**」，系統會自動讀取同目錄下的 `DataCollection(Stage 1).xlsx`（若以本機 `file://` 開啟無法自動讀取時，會自動彈出檔案選擇視窗請您選取 `DataCollection(Stage 1).xlsx`），將軟體與硬體資料合併並以紅字標示新增列後下載。

---

## 📁 專案檔案結構 (Project Structure)

| 檔案名稱 | 說明 |
| :--- | :--- |
| `index.html` | 主網頁結構（含中／英雙語屬性標記、Step 0～Step 3 與收集清單介面） |
| `Data-Collection-tool_style.css` | 樣式表（支援亮色／深色／灰色三種 CSS 變數主題與響應式排版） |
| `Data-Collection-tool_script.js` | 核心邏輯（模式切換、語言切換、數值輸入防呆、動態權重計算、ExcelJS 匯出與圖片置中嵌入） |
| `DataCollection(Stage 1).xlsx` | OASE Lab. 團隊專家基準資料模型檔（供最終檔案合併使用） |
| `QCI&AI資料模型蒐集工具_操作手冊.docx` | Word 版完整圖文操作手冊 |
| `QCI&AI資料模型蒐集工具_操作手冊.pdf` | PDF 版完整圖文操作手冊 |

---

## 👥 作者與版權資訊 (Credits & License)

- **原作者 (Original Author)**：OASE Lab. [陳心瑋 (Hsin-Wei Chen)](https://github.com/B0223048)
- **改編者 (Adapted by)**：OASE Lab. [曾俊杰 (Chun-Chieh Tseng)](https://github.com/Star369666)
- **版權所有**：© 2026 [OASE Lab.](https://sites.google.com/site/nutnoaselab/) All rights reserved.