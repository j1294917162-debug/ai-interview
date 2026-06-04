/**
 * 校园招聘面试智能分析工具 — 本地代理服务器
 *
 * 职责：
 * 1. 提供 index.html 静态页面
 * 2. 代理 POST /api/analyze → 智谱 GLM API
 * 3. 保护 API Key（Key 来自浏览器内存，服务器转发后即丢弃）
 *
 * 零依赖：仅使用 Node.js 内置模块（http, fs, path）+ 全局 fetch（Node 18+）
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// ============================================================
// 配置
// ============================================================

const PORT = process.env.PORT || 3000;
const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL = "glm-4-flash";
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;
const REQUEST_TIMEOUT_MS = 60_000; // 60 秒超时

// ============================================================
// MIME 类型映射
// ============================================================

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ============================================================
// 静态文件服务
// ============================================================

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
    } else {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("500 Internal Server Error");
    }
  }
}

// ============================================================
// 请求体解析
// ============================================================

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error("请求体 JSON 解析失败"));
      }
    });
    req.on("error", () => reject(new Error("读取请求体失败")));
  });
}

// ============================================================
// 构建 System Prompt
// ============================================================

function buildSystemPrompt() {
  return `你是一位拥有10年经验的校园招聘面试官，专精于通过行为面试法评估候选人的综合素质。你的分析风格是客观、严格、基于证据的，不会给模糊评价，也不会因为回答流畅就给出高分。

你的任务：分析候选人针对面试问题的回答，从两个核心维度进行严格评估。

## 维度一：学习能力
- 候选人是否主动识别知识缺口并系统性学习？（被动上课不算）
- 学习路径是否清晰、有计划、有方法？（仅"跟着老师学"说明学习能力弱）
- 是否能将复杂知识转化为实践应用？（有具体成果才加分）
- 遇到困难时是否有主动攻坚的案例和具体策略？
- 是否有知识迁移、举一反三的证据？

## 维度二：自驱主动性
- 学习动机是内在驱动（发现问题、好奇、目标感）还是外部要求（课程、老师布置）？
- 是否主动寻找课堂之外的学习机会？
- 是否有超越最低要求的行动？（按模板完成作业不算主动性）
- 成果是否有实际影响力或可量化的产出？
- 是否有持续学习、自我迭代的长期行为？

## 三级判定标准（必须严格遵守）

### 建议直接面试 — 需同时满足：
- 有明确的"主动发现问题 → 自学 → 实践 → 产出成果"的完整闭环
- 学习过程有清晰规划和方法（如分阶段、找资源、加入社群等）
- 成果可量化或有实际影响力（覆盖人数、效率提升、获奖等）
- 学习动机是内在驱动的（非课程要求）

### 建议关注 — 满足以下任一：
- 有一定自主性但不够突出（如主动选了某门课，但仅完成课业要求）
- 有学习行为但缺乏深度规划或阶段性成果
- 回答中有"可能""以后""应该"等模糊表述，行动力不明确
- 学习停留在"知道"而非"做到"

### 建议淘汰 — 满足以下任一：
- 学习完全是被动接受（上课、按模板完成作业）
- 没有任何自发的学习行为或课外实践
- 回答空洞无具体细节，全是空话套话
- 对自己的不足没有反思，也看不出改进意愿

## 重要提示
- 仅完成课程作业、按老师模板提交项目，最多评为"建议关注"或"建议淘汰"
- "跟着老师节奏""按模板""上网搜索解决报错""拿到XX分"这类被动表述，不应评为"建议直接面试"
- 关键词必须严格从原文中提取，推理必须引用原文具体语句

## 输出格式要求
请严格按照以下JSON格式返回，不要包含markdown代码块标记或其他内容：
{
  "learningSignals": [
    {"keyword": "关键词", "reasoning": "基于原文细节的推理"}
  ],
  "initiativeSignals": [
    {"keyword": "关键词", "reasoning": "基于原文细节的推理"}
  ],
  "judgment": "建议直接面试|建议关注|建议淘汰",
  "briefReason": "一句话总结，30字以内"
}`;
}

// ============================================================
// 代理分析请求到智谱 GLM API
// ============================================================

async function proxyAnalyze(apiKey, question, answer) {
  const systemPrompt = buildSystemPrompt();
  const userMessage = `面试问题：${question}\n\n候选人回答：${answer}\n\n请基于以上内容进行分析。`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 处理错误响应
    if (!response.ok) {
      let errorMsg;
      try {
        const errData = await response.json();
        errorMsg = errData?.error?.message || "";
      } catch {
        errorMsg = "";
      }

      const errorMap = {
        401: "API密钥无效，请检查后重试。",
        403: "API密钥权限不足，请检查账户状态。",
        429: "请求过于频繁，请等待30秒后重试。",
        500: "GLM 服务暂时不可用，请稍后重试。",
        503: "GLM 服务繁忙，请稍后重试。",
      };
      const msg =
        errorMap[response.status] ||
        (errorMsg ? `API 错误：${errorMsg}` : `API 请求失败（状态码：${response.status}），请稍后重试。`);
      throw new Error(msg);
    }

    const data = await response.json();

    // 提取 GLM 返回的文本内容（OpenAI 兼容格式）
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI 返回内容为空，请重试。");
    }

    return content;
  } catch (err) {
    clearTimeout(timeoutId);

    // AbortController 超时
    if (err.name === "AbortError") {
      throw new Error("请求超时（60秒），请检查网络后重试。");
    }

    // 已经是中文错误消息，直接抛出
    if (
      err.message.includes("API密钥") ||
      err.message.includes("频繁") ||
      err.message.includes("不可用") ||
      err.message.includes("繁忙") ||
      err.message.includes("失败") ||
      err.message.includes("超时") ||
      err.message.includes("为空") ||
      err.message.includes("API 错误")
    ) {
      throw err;
    }

    // 网络连接错误
    if (err.cause?.code === "ECONNREFUSED" || err.cause?.code === "ENOTFOUND") {
      throw new Error("网络连接失败，请检查网络后重试。");
    }

    throw new Error(`分析请求失败：${err.message}`);
  }
}

// ============================================================
// 设置 CORS 头
// ============================================================

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ============================================================
// 发送 JSON 响应
// ============================================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

// ============================================================
// 路由处理
// ============================================================

async function handleRequest(req, res) {
  setCorsHeaders(res);

  // 预检请求
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET / — 返回首页
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const indexPath = path.join(__dirname, "index.html");
    serveStaticFile(res, indexPath);
    return;
  }

  // POST /api/analyze — 代理分析请求
  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const body = await parseBody(req);
      const { apiKey, question, answer } = body;

      // 参数校验
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
        sendJson(res, 400, { error: "请提供有效的 API Key。" });
        return;
      }
      if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
        sendJson(res, 400, { error: "候选人回答不能为空。" });
        return;
      }
      if (answer.trim().length < 20) {
        sendJson(res, 400, { error: "回答内容过短（少于20字），请提供更详细的回答。" });
        return;
      }

      const questionText = (question && question.trim()) || "未提供面试问题";
      const result = await proxyAnalyze(apiKey.trim(), questionText, answer.trim());

      // 尝试解析 JSON，处理可能的 markdown 代码块包装
      let parsed;
      let rawText = result;

      // 尝试直接解析
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // 尝试剥离 ```json ... ``` 包装
        const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          try {
            parsed = JSON.parse(codeBlockMatch[1].trim());
            rawText = codeBlockMatch[1].trim();
          } catch {
            // 剥离失败，返回原始文本
            sendJson(res, 200, {
              raw: true,
              rawText: rawText,
              warning: "AI 返回格式异常，以下为原始分析结果。",
            });
            return;
          }
        } else {
          // 没有代码块，返回原始文本
          sendJson(res, 200, {
            raw: true,
            rawText: rawText,
            warning: "AI 返回格式异常，以下为原始分析结果。",
          });
          return;
        }
      }

      // 验证必要字段
      if (
        !parsed.learningSignals ||
        !parsed.initiativeSignals ||
        !parsed.judgment ||
        !parsed.briefReason
      ) {
        sendJson(res, 200, {
          raw: true,
          rawText: rawText,
          warning: "AI 返回内容不完整，以下为原始分析结果。",
        });
        return;
      }

      sendJson(res, 200, { raw: false, ...parsed });
    } catch (err) {
      const statusCode = err.message.includes("API密钥") ? 401 : 500;
      sendJson(res, statusCode, { error: err.message });
    }
    return;
  }

  // 其他请求 — 404
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
}

// ============================================================
// 启动服务器
// ============================================================

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log("");
  console.log("══════════════════════════════════════════════");
  console.log("  校园招聘面试智能分析工具 v1.0");
  console.log("══════════════════════════════════════════════");
  console.log("");
  console.log(`  服务已启动：http://localhost:${PORT}`);
  console.log("");
  console.log("  请在浏览器中打开上方地址使用工具。");
  console.log("  按 Ctrl+C 停止服务。");
  console.log("");
  console.log("══════════════════════════════════════════════");
  console.log("");
});
