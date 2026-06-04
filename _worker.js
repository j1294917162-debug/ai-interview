/**
 * Cloudflare Worker — 校园招聘面试智能分析工具
 * 一个脚本同时处理：静态页面 + API 代理
 */

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL = "glm-4-flash";
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 60000;

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>校园招聘面试智能分析工具</title>
<style>
/* ============================================================
   CSS 变量 — 色彩系统
   ============================================================ */
:root {
  --color-primary: #4A90D9;
  --color-primary-light: #E8F0FE;
  --color-primary-dark: #3A7BC8;
  --color-bg: #F5F7FA;
  --color-surface: #FFFFFF;
  --color-border: #E1E8ED;
  --color-text-primary: #2C3E50;
  --color-text-secondary: #7F8C8D;
  --color-text-muted: #BDC3C7;
  --color-pass: #27AE60;
  --color-pass-bg: #E8F8F5;
  --color-review: #F39C12;
  --color-review-bg: #FEF9E7;
  --color-reject: #E74C3C;
  --color-reject-bg: #FDEDEC;
  --color-error: #E74C3C;
  --color-error-bg: #FDEDEC;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-card-hover: 0 4px 12px rgba(0,0,0,0.1);
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
}

/* ============================================================
   基础样式
   ============================================================ */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-primary);
  background: var(--color-bg);
  min-height: 100vh;
  padding: var(--space-lg);
}

.container {
  max-width: 900px;
  margin: 0 auto;
}

/* ============================================================
   标题栏
   ============================================================ */
.header {
  text-align: center;
  padding: var(--space-xl) 0 var(--space-lg);
}

.header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.header .subtitle {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* ============================================================
   API Key 设置栏
   ============================================================ */
.settings-toggle {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-sm);
}

.settings-toggle button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.settings-toggle button:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.settings-panel {
  display: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-lg);
}

.settings-panel.visible {
  display: block;
}

.settings-panel.no-key {
  border-color: var(--color-review);
  background: var(--color-review-bg);
}

.settings-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  flex-wrap: wrap;
}

.settings-row label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--color-text-primary);
}

.settings-row input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: monospace;
  outline: none;
  transition: border-color 0.2s;
}

.settings-row input:focus {
  border-color: var(--color-primary);
}

.settings-row .btn-sm {
  padding: 8px 16px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-save {
  background: var(--color-primary);
  color: #fff;
}

.btn-save:hover {
  background: var(--color-primary-dark);
}

.btn-toggle-key {
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.settings-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: var(--space-sm);
}

.no-key-warning {
  font-size: 12px;
  color: var(--color-review);
  margin-top: var(--space-sm);
  font-weight: 600;
}

/* ============================================================
   卡片通用样式
   ============================================================ */
.card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-md);
}

/* ============================================================
   输入区域
   ============================================================ */
.input-group {
  margin-bottom: var(--space-md);
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-sm);
}

.input-group input[type="text"],
.input-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: var(--font-family);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.2s;
  resize: vertical;
}

.input-group input[type="text"]:focus,
.input-group textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.input-group input[type="text"].error,
.input-group textarea.error {
  border-color: var(--color-error);
  box-shadow: 0 0 0 3px var(--color-error-bg);
}

.input-group textarea {
  min-height: 200px;
  line-height: 1.8;
}

.question-row {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-start;
}

.question-row input {
  flex: 1;
}

.btn-reset {
  padding: 10px 14px;
  font-size: 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-reset:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.char-count {
  text-align: right;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}

.char-count.warn {
  color: var(--color-error);
}

.validation-msg {
  font-size: 12px;
  color: var(--color-error);
  margin-top: var(--space-xs);
  display: none;
}

.validation-msg.visible {
  display: block;
}

/* ============================================================
   按钮组
   ============================================================ */
.button-group {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  flex-wrap: wrap;
  margin-top: var(--space-md);
}

.btn {
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  font-family: var(--font-family);
}

.btn-outline {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.btn-outline:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-outline.btn-demo-excellent:hover {
  border-color: var(--color-pass);
  color: var(--color-pass);
  background: var(--color-pass-bg);
}

.btn-outline.btn-demo-average:hover {
  border-color: var(--color-review);
  color: var(--color-review);
  background: var(--color-review-bg);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
  margin-left: auto;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
  box-shadow: var(--shadow-card-hover);
}

.btn-primary:disabled {
  background: var(--color-text-muted);
  cursor: not-allowed;
}

/* 加载中旋转图标 */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ============================================================
   输出区域
   ============================================================ */
.output-area {
  display: none;
}

.output-area.visible {
  display: block;
}

/* 骨架屏 */
.skeleton {
  display: none;
}

.skeleton.visible {
  display: block;
}

.skeleton-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.skeleton-line {
  height: 14px;
  background: var(--color-bg);
  border-radius: 4px;
  margin-bottom: var(--space-sm);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line:last-child {
  margin-bottom: 0;
}

.skeleton-line.w60 { width: 60%; }
.skeleton-line.w80 { width: 80%; }
.skeleton-line.w40 { width: 40%; }
.skeleton-line.w100 { width: 100%; }
.skeleton-line.h28 { height: 28px; margin-bottom: var(--space-md); }

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* 占位提示 */
.output-placeholder {
  text-align: center;
  padding: var(--space-2xl) var(--space-lg);
  color: var(--color-text-muted);
  font-size: 14px;
}

/* 信号卡片 */
.signal-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  animation: fadeInUp 0.4s ease both;
}

.signal-card:nth-child(2) { animation-delay: 0.1s; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.signal-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}

.signal-icon {
  font-size: 20px;
}

.signal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.signal-badges {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  margin-left: auto;
}

.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.signal-list {
  list-style: none;
  padding: 0;
}

.signal-list li {
  position: relative;
  padding-left: 16px;
  margin-bottom: var(--space-sm);
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-primary);
}

.signal-list li::before {
  content: "·";
  position: absolute;
  left: 4px;
  color: var(--color-primary);
  font-weight: 700;
}

.signal-list li:last-child {
  margin-bottom: 0;
}

/* 综合判断卡片 */
.judgment-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  text-align: center;
  animation: fadeInUp 0.4s ease both;
  animation-delay: 0.2s;
}

.judgment-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
}

.judgment-badge {
  display: inline-block;
  padding: 8px 28px;
  border-radius: 20px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.judgment-badge.pass {
  background: var(--color-pass);
}

.judgment-badge.review {
  background: var(--color-review);
}

.judgment-badge.reject {
  background: var(--color-reject);
}

/* 简要理由卡片 */
.reason-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  animation: fadeInUp 0.4s ease both;
  animation-delay: 0.3s;
}

.reason-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-primary);
  padding: var(--space-md);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-primary);
}

/* 错误提示 */
.error-toast {
  display: none;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-lg);
  color: var(--color-error);
  font-size: 14px;
  animation: fadeInUp 0.3s ease;
}

.error-toast.visible {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error-toast .close-toast {
  background: none;
  border: none;
  color: var(--color-error);
  cursor: pointer;
  font-size: 18px;
  padding: 0 0 0 var(--space-md);
  line-height: 1;
}

/* 原始文本降级显示 */
.raw-output {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-primary);
}

.raw-warning {
  background: var(--color-review-bg);
  border: 1px solid var(--color-review);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
  font-size: 13px;
  color: var(--color-review);
  font-weight: 600;
}

/* ============================================================
   页脚
   ============================================================ */
.footer {
  text-align: center;
  padding: var(--space-lg) 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ============================================================
   响应式
   ============================================================ */
@media (max-width: 640px) {
  body {
    padding: var(--space-md);
  }

  .header h1 {
    font-size: 20px;
  }

  .card {
    padding: var(--space-md);
  }

  .button-group {
    flex-direction: column;
  }

  .button-group .btn-primary {
    margin-left: 0;
    width: 100%;
  }

  .button-group .btn-outline {
    width: 100%;
  }

  .settings-row {
    flex-direction: column;
  }

  .settings-row input {
    min-width: auto;
    width: 100%;
  }

  .question-row {
    flex-direction: column;
  }

  .signal-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .signal-badges {
    margin-left: 0;
  }
}
</style>
</head>
<body>

<div class="container">

  <!-- ========================================================
       标题栏
       ======================================================== -->
  <div class="header">
    <h1>校园招聘面试智能分析工具</h1>
    <p class="subtitle">基于 GLM AI · 行为面试智能评估 · 学习能力 &amp; 自驱主动性</p>
  </div>

  <!-- ========================================================
       API Key 设置栏
       ======================================================== -->
  <div class="settings-toggle">
    <button id="btnSettingsToggle" title="配置 API Key">
      ⚙️ API 设置
    </button>
  </div>

  <div class="settings-panel" id="settingsPanel">
    <div class="settings-row">
      <label for="apiKeyInput">智谱 API Key</label>
      <input type="password" id="apiKeyInput" placeholder="请输入智谱 API Key..." autocomplete="off">
      <button class="btn-sm btn-toggle-key" id="btnToggleKey" type="button">显示</button>
      <button class="btn-sm btn-save" id="btnSaveKey" type="button">保存</button>
    </div>
    <div class="settings-row" style="margin-top:8px;">
      <label style="font-weight:400;display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="chkRememberKey" style="width:auto;min-width:auto;"> 记住密钥（关闭浏览器后仍保留）
      </label>
    </div>
    <p class="settings-hint">密钥仅保存在浏览器本地存储中，不会上传至任何第三方服务器。</p>
    <p class="no-key-warning" id="noKeyWarning" style="display:none;">⚠️ 请先配置 API Key 后再开始分析</p>
  </div>

  <!-- ========================================================
       错误提示
       ======================================================== -->
  <div class="error-toast" id="errorToast">
    <span id="errorMsg"></span>
    <button class="close-toast" id="btnCloseToast">&times;</button>
  </div>

  <!-- ========================================================
       输入区域
       ======================================================== -->
  <div class="card" id="inputCard">
    <div class="card-title">📋 面试内容输入</div>

    <div class="input-group">
      <label for="questionInput">面试问题</label>
      <div class="question-row">
        <input type="text" id="questionInput" placeholder="请输入面试问题...">
        <button class="btn-reset" id="btnResetQuestion">重置</button>
      </div>
    </div>

    <div class="input-group">
      <label for="answerInput">候选人回答</label>
      <textarea id="answerInput" placeholder="请将候选人的回答粘贴到这里...&#10;&#10;支持粘贴较长文本，建议至少 50 字以获得更准确的分析结果。"></textarea>
      <div class="char-count" id="charCount">字数：0</div>
      <div class="validation-msg" id="validationMsg"></div>
    </div>

    <div class="button-group">
      <button class="btn btn-outline btn-demo-excellent" id="btnExcellent">🌟 优秀案例</button>
      <button class="btn btn-outline btn-demo-average" id="btnAverage">📋 普通案例</button>
      <button class="btn btn-outline" id="btnClear">🗑️ 清空</button>
      <button class="btn btn-primary" id="btnAnalyze" disabled>
        🔍 开始分析
      </button>
    </div>
  </div>

  <!-- ========================================================
       加载骨架屏
       ======================================================== -->
  <div class="skeleton" id="skeleton">
    <div class="skeleton-card">
      <div class="skeleton-line w40 h28"></div>
      <div class="skeleton-line w100"></div>
      <div class="skeleton-line w80"></div>
      <div class="skeleton-line w60"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-line w40 h28"></div>
      <div class="skeleton-line w100"></div>
      <div class="skeleton-line w80"></div>
      <div class="skeleton-line w60"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-line w40 h28"></div>
      <div class="skeleton-line w60"></div>
    </div>
  </div>

  <!-- ========================================================
       输出区域
       ======================================================== -->
  <div class="output-area" id="outputArea">
    <div id="outputContent"></div>
  </div>

  <!-- ========================================================
       页脚
       ======================================================== -->
  <div class="footer">
    基于 GLM API 分析 · 结果仅供参考 · 候选人数据仅存储于本地浏览器内存
  </div>

</div>

<!-- ============================================================
     JavaScript 逻辑
     ============================================================ -->
<script>
(function () {
  "use strict";

  // ==========================================================
  // 预设文本
  // ==========================================================

  const DEFAULT_QUESTION =
    "请分享一个你自学一项新技能并应用到实践中的经历。请具体描述：1）你是如何学习的？2）过程中遇到了什么困难？3）最终如何应用的？";

  const EXCELLENT_ANSWER =
    "在我大二的时候，我注意到我们学院的社团活动报名流程非常混乱，每次都需要手动统计Excel表格，经常出错且效率低下。虽然我是市场营销专业的学生，没有任何编程基础，但我决定自学Web开发来搭建一个社团活动管理系统。\\n\\n" +
    "我的学习过程分为三个阶段：首先，我通过B站上的免费课程系统学习了HTML、CSS和JavaScript基础，每天坚持学习2小时，花了3周时间完成了基础知识的学习。其次，我加入了学校的编程兴趣小组，每周参加一次线下讨论会，向有经验的同学请教。这个过程中遇到的最大困难是理解异步编程和数据库设计——我花了整整一周的时间，通过画流程图和写小demo的方式才彻底理解。第三阶段是实践应用，我用学到的知识搭建了一个基于Vue.js和Node.js的管理系统。\\n\\n" +
    "最终这个系统在我们学院5个社团推广使用，覆盖了300多名学生，将活动报名效率提升了70%。这次经历让我意识到跨学科技能的重要性，之后我又自学了数据分析，现在能够用数据驱动的方式进行营销决策。";

  const AVERAGE_ANSWER =
    "我在学校选修了一门Python课程，跟着老师的节奏学习了一些基础的语法和数据处理方法。课程中有一个小组项目，我们需要用Python做一个简单的数据分析。我主要负责数据清洗部分，按照老师给的模板完成了一些基础的数据处理。过程中遇到了一些代码报错，通过上网搜索解决了。最后项目顺利通过了，拿到了85分的成绩。我觉得编程挺有用的，以后可能会继续学习。";

  // ==========================================================
  // DOM 元素引用
  // ==========================================================

  const \$ = (sel) => document.querySelector(sel);

  const elQuestionInput = \$("#questionInput");
  const elAnswerInput = \$("#answerInput");
  const elCharCount = \$("#charCount");
  const elValidationMsg = \$("#validationMsg");
  const elBtnAnalyze = \$("#btnAnalyze");
  const elBtnExcellent = \$("#btnExcellent");
  const elBtnAverage = \$("#btnAverage");
  const elBtnClear = \$("#btnClear");
  const elBtnReset = \$("#btnResetQuestion");
  const elSettingsToggle = \$("#btnSettingsToggle");
  const elSettingsPanel = \$("#settingsPanel");
  const elApiKeyInput = \$("#apiKeyInput");
  const elBtnSaveKey = \$("#btnSaveKey");
  const elBtnToggleKey = \$("#btnToggleKey");
  const elNoKeyWarning = \$("#noKeyWarning");
  const elOutputArea = \$("#outputArea");
  const elOutputContent = \$("#outputContent");
  const elSkeleton = \$("#skeleton");
  const elErrorToast = \$("#errorToast");
  const elErrorMsg = \$("#errorMsg");
  const elBtnCloseToast = \$("#btnCloseToast");
  const elChkRememberKey = \$("#chkRememberKey");

  // ==========================================================
  // 状态
  // ==========================================================

  let isAnalyzing = false;

  const STORAGE_KEY = "ai_interview_api_key";
  const REMEMBER_KEY = "ai_interview_remember_key";

  function getApiKey() {
    // 优先从 localStorage 读取（如果用户勾选了记住）
    if (localStorage.getItem(REMEMBER_KEY) === "true") {
      return localStorage.getItem(STORAGE_KEY) || "";
    }
    return sessionStorage.getItem(STORAGE_KEY) || "";
  }

  function setApiKey(key) {
    if (elChkRememberKey && elChkRememberKey.checked) {
      localStorage.setItem(STORAGE_KEY, key);
      localStorage.setItem(REMEMBER_KEY, "true");
    } else {
      sessionStorage.setItem(STORAGE_KEY, key);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    }
  }

  function updateAnalyzeButton() {
    const hasKey = getApiKey().length > 0;
    const hasAnswer = elAnswerInput.value.trim().length >= 20;
    const notLoading = !isAnalyzing;
    elBtnAnalyze.disabled = !(hasKey && hasAnswer && notLoading);
  }

  // ==========================================================
  // API Key 设置
  // ==========================================================

  function restoreApiKey() {
    // 恢复"记住密钥"复选框状态
    if (elChkRememberKey) {
      elChkRememberKey.checked = localStorage.getItem(REMEMBER_KEY) === "true";
    }

    const key = getApiKey();
    if (key) {
      elApiKeyInput.value = key;
      elSettingsPanel.classList.remove("no-key");
      elNoKeyWarning.style.display = "none";
      elSettingsPanel.classList.remove("visible");
    } else {
      elSettingsPanel.classList.add("no-key");
      elSettingsPanel.classList.add("visible");
      elNoKeyWarning.style.display = "block";
    }
    updateAnalyzeButton();
  }

  elBtnSaveKey.addEventListener("click", () => {
    const key = elApiKeyInput.value.trim();
    if (key) {
      setApiKey(key);
      elSettingsPanel.classList.remove("no-key");
      elNoKeyWarning.style.display = "none";
      elSettingsPanel.classList.remove("visible");
      elErrorToast.classList.remove("visible");
      const persistMsg = (elChkRememberKey && elChkRememberKey.checked) ? "（已锁定，重启后仍有效）" : "（当前标签页有效）";
      showToast("API Key 已保存 " + persistMsg, true);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(REMEMBER_KEY);
      if (elChkRememberKey) elChkRememberKey.checked = false;
      elSettingsPanel.classList.add("no-key");
      elNoKeyWarning.style.display = "block";
    }
    updateAnalyzeButton();
  });

  elBtnToggleKey.addEventListener("click", () => {
    const isPassword = elApiKeyInput.type === "password";
    elApiKeyInput.type = isPassword ? "text" : "password";
    elBtnToggleKey.textContent = isPassword ? "隐藏" : "显示";
  });

  elSettingsToggle.addEventListener("click", () => {
    elSettingsPanel.classList.toggle("visible");
    if (elSettingsPanel.classList.contains("visible") && !getApiKey()) {
      elSettingsPanel.classList.add("no-key");
      elNoKeyWarning.style.display = "block";
    }
  });

  // ==========================================================
  // Toast 提示
  // ==========================================================

  let toastTimer = null;

  function showToast(msg, isSuccess) {
    clearTimeout(toastTimer);
    elErrorMsg.textContent = msg;
    elErrorToast.classList.add("visible");
    if (isSuccess) {
      elErrorToast.style.background = "var(--color-pass-bg)";
      elErrorToast.style.border = "1px solid var(--color-pass)";
      elErrorToast.style.color = "var(--color-pass)";
    } else {
      elErrorToast.style.background = "var(--color-error-bg)";
      elErrorToast.style.border = "1px solid var(--color-error)";
      elErrorToast.style.color = "var(--color-error)";
    }
    toastTimer = setTimeout(() => {
      elErrorToast.classList.remove("visible");
    }, 4000);
  }

  elBtnCloseToast.addEventListener("click", () => {
    elErrorToast.classList.remove("visible");
    clearTimeout(toastTimer);
  });

  // ==========================================================
  // 输入区事件
  // ==========================================================

  elAnswerInput.addEventListener("input", () => {
    const len = elAnswerInput.value.length;
    elCharCount.textContent = \`字数：\${len}\`;
    elCharCount.classList.toggle("warn", len > 0 && len < 20);
    elValidationMsg.classList.remove("visible");
    elAnswerInput.classList.remove("error");
    updateAnalyzeButton();
  });

  // 粘贴时只保留纯文本
  elAnswerInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    const start = elAnswerInput.selectionStart;
    const end = elAnswerInput.selectionEnd;
    const before = elAnswerInput.value.substring(0, start);
    const after = elAnswerInput.value.substring(end);
    elAnswerInput.value = before + text + after;
    elAnswerInput.dispatchEvent(new Event("input"));
  });

  elBtnReset.addEventListener("click", () => {
    elQuestionInput.value = DEFAULT_QUESTION;
    // 视觉反馈：短暂高亮输入框
    elQuestionInput.style.transition = "background 0.3s";
    elQuestionInput.style.background = "var(--color-primary-light)";
    setTimeout(() => {
      elQuestionInput.style.background = "";
    }, 500);
    showToast("已恢复默认面试问题 ✓", true);
  });

  elBtnClear.addEventListener("click", () => {
    elAnswerInput.value = "";
    elAnswerInput.dispatchEvent(new Event("input"));
    elOutputArea.classList.remove("visible");
    elOutputContent.innerHTML = "";
    elErrorToast.classList.remove("visible");
  });

  elBtnExcellent.addEventListener("click", () => {
    elAnswerInput.value = EXCELLENT_ANSWER;
    elAnswerInput.classList.remove("error");
    elValidationMsg.classList.remove("visible");
    elAnswerInput.dispatchEvent(new Event("input"));
    elOutputArea.classList.remove("visible");
    elOutputContent.innerHTML = "";
    elErrorToast.classList.remove("visible");
  });

  elBtnAverage.addEventListener("click", () => {
    elAnswerInput.value = AVERAGE_ANSWER;
    elAnswerInput.classList.remove("error");
    elValidationMsg.classList.remove("visible");
    elAnswerInput.dispatchEvent(new Event("input"));
    elOutputArea.classList.remove("visible");
    elOutputContent.innerHTML = "";
    elErrorToast.classList.remove("visible");
  });

  // ==========================================================
  // API 请求
  // ==========================================================

  async function analyzeAnswer() {
    const apiKey = getApiKey();
    const question = elQuestionInput.value.trim() || DEFAULT_QUESTION;
    const answer = elAnswerInput.value.trim();

    // 前端校验
    if (!apiKey) {
      elSettingsPanel.classList.add("visible", "no-key");
      elNoKeyWarning.style.display = "block";
      showToast("请先配置 API Key 后再开始分析。");
      return;
    }
    if (!answer) {
      elAnswerInput.classList.add("error");
      elValidationMsg.textContent = "请输入候选人回答。";
      elValidationMsg.classList.add("visible");
      return;
    }
    if (answer.length < 20) {
      elAnswerInput.classList.add("error");
      elValidationMsg.textContent = "回答内容过短（少于20字），请提供更详细的回答。";
      elValidationMsg.classList.add("visible");
      return;
    }

    // 开始加载
    isAnalyzing = true;
    updateAnalyzeButton();
    elBtnAnalyze.innerHTML = '<span class="spinner"></span>分析中...';
    elOutputArea.classList.remove("visible");
    elOutputContent.innerHTML = "";
    elErrorToast.classList.remove("visible");
    elSkeleton.classList.add("visible");
    elSkeleton.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, question, answer }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || \`请求失败（状态码：\${response.status}）\`);
      }

      renderResult(data);
    } catch (err) {
      // 网络连接失败
      if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
        showToast("无法连接到本地服务器。请确认已双击运行 start.bat 启动服务。");
      } else {
        showToast(err.message);
      }
    } finally {
      isAnalyzing = false;
      updateAnalyzeButton();
      elBtnAnalyze.innerHTML = "🔍 开始分析";
      elSkeleton.classList.remove("visible");
    }
  }

  elBtnAnalyze.addEventListener("click", analyzeAnswer);

  // 快捷键 Ctrl+Enter 触发分析
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!isAnalyzing && !elBtnAnalyze.disabled) {
        analyzeAnswer();
      }
    }
  });

  // ==========================================================
  // 结果渲染
  // ==========================================================

  function renderResult(data) {
    elOutputContent.innerHTML = "";

    // 降级显示：原始文本
    if (data.raw) {
      const warning = document.createElement("div");
      warning.className = "raw-warning";
      warning.textContent = "⚠️ " + (data.warning || "AI 返回格式异常，以下为原始分析结果。");

      const rawDiv = document.createElement("div");
      rawDiv.className = "raw-output";
      rawDiv.textContent = data.rawText;

      elOutputContent.appendChild(warning);
      elOutputContent.appendChild(rawDiv);
      elOutputArea.classList.add("visible");
      elOutputArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // 学习能力信号
    if (data.learningSignals && data.learningSignals.length > 0) {
      const card = createSignalCard(
        "📚",
        "学习能力信号",
        data.learningSignals
      );
      elOutputContent.appendChild(card);
    }

    // 自驱主动性信号
    if (data.initiativeSignals && data.initiativeSignals.length > 0) {
      const card = createSignalCard(
        "🚀",
        "自驱主动性信号",
        data.initiativeSignals
      );
      elOutputContent.appendChild(card);
    }

    // 综合判断
    if (data.judgment) {
      const card = createJudgmentCard(data.judgment);
      elOutputContent.appendChild(card);
    }

    // 简要理由
    if (data.briefReason) {
      const card = createReasonCard(data.briefReason);
      elOutputContent.appendChild(card);
    }

    elOutputArea.classList.add("visible");
    elOutputArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function createSignalCard(icon, title, signals) {
    const card = document.createElement("div");
    card.className = "signal-card";

    // 头部
    const header = document.createElement("div");
    header.className = "signal-header";

    const iconSpan = document.createElement("span");
    iconSpan.className = "signal-icon";
    iconSpan.textContent = icon;

    const titleSpan = document.createElement("span");
    titleSpan.className = "signal-title";
    titleSpan.textContent = title;

    header.appendChild(iconSpan);
    header.appendChild(titleSpan);

    // 关键词徽章
    const badgesDiv = document.createElement("div");
    badgesDiv.className = "signal-badges";
    signals.forEach((s) => {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = s.keyword;
      badgesDiv.appendChild(badge);
    });
    header.appendChild(badgesDiv);

    card.appendChild(header);

    // 推理列表
    const list = document.createElement("ul");
    list.className = "signal-list";
    signals.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s.reasoning;
      list.appendChild(li);
    });
    card.appendChild(list);

    return card;
  }

  function createJudgmentCard(judgment) {
    const card = document.createElement("div");
    card.className = "judgment-card";

    const label = document.createElement("div");
    label.className = "judgment-label";
    label.textContent = "综合判断";

    const badge = document.createElement("span");
    badge.className = "judgment-badge";

    if (judgment.includes("直接面试") || judgment.includes("建议直接")) {
      badge.classList.add("pass");
    } else if (judgment.includes("关注") || judgment.includes("建议关注")) {
      badge.classList.add("review");
    } else if (judgment.includes("淘汰") || judgment.includes("建议淘汰")) {
      badge.classList.add("reject");
    } else {
      badge.classList.add("review"); // 默认黄色
    }
    badge.textContent = judgment;

    card.appendChild(label);
    card.appendChild(badge);
    return card;
  }

  function createReasonCard(reason) {
    const card = document.createElement("div");
    card.className = "reason-card";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = "💬 简要理由";

    const text = document.createElement("div");
    text.className = "reason-text";
    text.textContent = reason;

    card.appendChild(title);
    card.appendChild(text);
    return card;
  }

  // ==========================================================
  // 初始化
  // ==========================================================

  function init() {
    if (!elQuestionInput || !elAnswerInput) {
      console.error("关键 DOM 元素未找到，初始化失败");
      return;
    }
    elQuestionInput.value = DEFAULT_QUESTION;
    restoreApiKey();
    updateAnalyzeButton();
    elCharCount.textContent = "字数：0";
  }

  // 确保 DOM 就绪后再初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
</script>

</body>
</html>
`;

function buildSystemPrompt() {
  return "你是一位拥有10年经验的校园招聘面试官，专精于通过行为面试法评估候选人的综合素质。你的分析风格是客观、严格、基于证据的，不会给模糊评价，也不会因为回答流畅就给出高分。\n\n" +
    "你的任务：分析候选人针对面试问题的回答，从两个核心维度进行严格评估。\n\n" +
    "## 维度一：学习能力\n" +
    "- 候选人是否主动识别知识缺口并系统性学习？（被动上课不算）\n" +
    "- 学习路径是否清晰、有计划、有方法？（仅\"跟着老师学\"说明学习能力弱）\n" +
    "- 是否能将复杂知识转化为实践应用？（有具体成果才加分）\n" +
    "- 遇到困难时是否有主动攻坚的案例和具体策略？\n" +
    "- 是否有知识迁移、举一反三的证据？\n\n" +
    "## 维度二：自驱主动性\n" +
    "- 学习动机是内在驱动（发现问题、好奇、目标感）还是外部要求（课程、老师布置）？\n" +
    "- 是否主动寻找课堂之外的学习机会？\n" +
    "- 是否有超越最低要求的行动？（按模板完成作业不算主动性）\n" +
    "- 成果是否有实际影响力或可量化的产出？\n" +
    "- 是否有持续学习、自我迭代的长期行为？\n\n" +
    "## 三级判定标准（必须严格遵守）\n\n" +
    "### 建议直接面试 — 需同时满足：\n" +
    "- 有明确的\"主动发现问题 → 自学 → 实践 → 产出成果\"的完整闭环\n" +
    "- 学习过程有清晰规划和方法（如分阶段、找资源、加入社群等）\n" +
    "- 成果可量化或有实际影响力\n" +
    "- 学习动机是内在驱动的（非课程要求）\n\n" +
    "### 建议关注 — 满足以下任一：\n" +
    "- 有一定自主性但不够突出\n" +
    "- 有学习行为但缺乏深度规划或阶段性成果\n" +
    "- 回答中有模糊表述，行动力不明确\n" +
    "- 学习停留在\"知道\"而非\"做到\"\n\n" +
    "### 建议淘汰 — 满足以下任一：\n" +
    "- 学习完全是被动接受（上课、按模板完成作业）\n" +
    "- 没有任何自发的学习行为或课外实践\n" +
    "- 回答空洞无具体细节\n\n" +
    "## 重要提示\n" +
    "- 仅完成课程作业、按老师模板提交项目，最多评为\"建议关注\"或\"建议淘汰\"\n" +
    "- \"跟着老师节奏\"\"按模板\"\"上网搜索解决报错\"这类被动表述，不应评为\"建议直接面试\"\n" +
    "- 关键词必须严格从原文中提取，推理必须引用原文具体语句\n\n" +
    "## 输出格式\n" +
    "请严格按照以下JSON格式返回，不要包含markdown代码块标记：\n" +
    '{ "learningSignals": [{"keyword": "关键词", "reasoning": "基于原文细节的推理"}], ' +
    '"initiativeSignals": [{"keyword": "关键词", "reasoning": "基于原文细节的推理"}], ' +
    '"judgment": "建议直接面试|建议关注|建议淘汰", "briefReason": "一句话总结，30字以内" }';
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleAnalyze(request) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse(400, { error: "请求格式不正确。" }); }

  const { apiKey, question, answer } = body || {};

  if (!apiKey || apiKey.trim().length === 0)
    return jsonResponse(400, { error: "请提供有效的 API Key。" });
  if (!answer || answer.trim().length === 0)
    return jsonResponse(400, { error: "候选人回答不能为空。" });
  if (answer.trim().length < 20)
    return jsonResponse(400, { error: "回答内容过短（少于20字），请提供更详细的回答。" });

  const questionText = (question && question.trim()) || "未提供面试问题";
  const userMessage = "面试问题：" + questionText + "\n\n候选人回答：" + answer.trim() + "\n\n请基于以上内容进行分析。";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(GLM_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey.trim() },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userMessage },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      let errMsg;
      try { const e = await resp.json(); errMsg = e?.error?.message || ""; } catch { errMsg = ""; }
      const map = { 401: "API密钥无效，请检查后重试。", 403: "API密钥权限不足。", 429: "请求过于频繁，请稍后重试。", 500: "GLM 服务暂时不可用。", 503: "GLM 服务繁忙。" };
      return jsonResponse(resp.status, { error: map[resp.status] || (errMsg ? "API 错误：" + errMsg : "请求失败（" + resp.status + "）") });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return jsonResponse(500, { error: "AI 返回内容为空，请重试。" });

    // JSON 解析
    let parsed, rawText = content;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const m = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1].trim()); rawText = m[1].trim(); } catch { return jsonResponse(200, { raw: true, rawText, warning: "AI 返回格式异常。" }); } }
      else { return jsonResponse(200, { raw: true, rawText, warning: "AI 返回格式异常。" }); }
    }

    if (!parsed.learningSignals || !parsed.initiativeSignals || !parsed.judgment || !parsed.briefReason) {
      return jsonResponse(200, { raw: true, rawText, warning: "AI 返回内容不完整。" });
    }

    return jsonResponse(200, { raw: false, ...parsed });
  } catch (err) {
    if (err.name === "AbortError") return jsonResponse(504, { error: "请求超时（60秒），请重试。" });
    return jsonResponse(500, { error: "分析请求失败：" + err.message });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS 预检
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // API 代理
    if (method === "POST" && url.pathname === "/api/analyze") {
      return handleAnalyze(request);
    }

    // 静态页面（GET / 或 /index.html）
    if (method === "GET") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
