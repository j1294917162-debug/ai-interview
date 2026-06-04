/**
 * Cloudflare Pages Function — 代理转发到智谱 GLM API
 * 路由：POST /api/analyze
 */

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL = "glm-4-flash";
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 60000;

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
- 有一定自主性但不够突出
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

export async function onRequestPost(context) {
  const { request } = context;

  // CORS 预检
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "请求格式不正确。" });
  }

  const { apiKey, question, answer } = body || {};

  if (!apiKey || apiKey.trim().length === 0) {
    return jsonResponse(400, { error: "请提供有效的 API Key。" });
  }
  if (!answer || answer.trim().length === 0) {
    return jsonResponse(400, { error: "候选人回答不能为空。" });
  }
  if (answer.trim().length < 20) {
    return jsonResponse(400, { error: "回答内容过短（少于20字），请提供更详细的回答。" });
  }

  const questionText = (question && question.trim()) || "未提供面试问题";
  const systemPrompt = buildSystemPrompt();
  const userMessage = `面试问题：${questionText}\n\n候选人回答：${answer.trim()}\n\n请基于以上内容进行分析。`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
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

    if (!response.ok) {
      let errorMsg;
      try { const e = await response.json(); errorMsg = e?.error?.message || ""; } catch { errorMsg = ""; }
      const map = { 401: "API密钥无效，请检查后重试。", 403: "API密钥权限不足。", 429: "请求过于频繁，请稍后重试。", 500: "GLM 服务暂时不可用。", 503: "GLM 服务繁忙。" };
      return jsonResponse(response.status, { error: map[response.status] || (errorMsg ? `API 错误：${errorMsg}` : `请求失败（${response.status}）`) });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return jsonResponse(500, { error: "AI 返回内容为空，请重试。" });
    }

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
    return jsonResponse(500, { error: `分析请求失败：${err.message}` });
  }
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
