/**
 * Netlify Serverless Function — 代理转发到智谱 GLM API
 */

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const MODEL = "glm-4-flash";
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 60000;

function buildSystemPrompt() {
  return "你是一位拥有10年经验的校园招聘面试官，专精于通过行为面试法评估候选人的综合素质。你的分析风格是客观、严格、基于证据的，不会给模糊评价，也不会因为回答流畅就给出高分。\n\n" +
    "你的任务：分析候选人针对面试问题的回答，从两个核心维度进行严格评估。\n\n" +
    "## 维度一：学习能力\n- 候选人是否主动识别知识缺口并系统性学习？（被动上课不算）\n- 学习路径是否清晰、有计划、有方法？\n- 是否能将复杂知识转化为实践应用？（有具体成果才加分）\n- 遇到困难时是否有主动攻坚的案例和具体策略？\n\n" +
    "## 维度二：自驱主动性\n- 学习动机是内在驱动还是外部要求？\n- 是否主动寻找课堂之外的学习机会？\n- 是否有超越最低要求的行动？\n- 成果是否有实际影响力或可量化的产出？\n\n" +
    "## 三级判定标准（必须严格遵守）\n\n" +
    "建议直接面试（需同时满足）：主动发现问题→自学→实践→产出成果的完整闭环；学习过程有清晰规划和方法；成果可量化或有实际影响力；动机是内在驱动。\n\n" +
    "建议关注（满足任一）：有一定自主性但不够突出；有学习行为但缺乏深度规划；回答中有模糊表述；学习停留在'知道'而非'做到'。\n\n" +
    "建议淘汰（满足任一）：学习完全被动接受；没有任何自发学习行为；回答空洞无具体细节。\n\n" +
    "## 重要提示：仅完成课程作业、按模板提交项目，最多评为建议关注或建议淘汰。'跟着老师节奏''按模板''上网搜索解决报错'这类被动表述不应评为建议直接面试。\n\n" +
    '## 输出格式：严格JSON，不含markdown代码块。{"learningSignals":[{"keyword":"关键词","reasoning":"基于原文细节的推理"}],"initiativeSignals":[{"keyword":"关键词","reasoning":"基于原文细节的推理"}],"judgment":"建议直接面试|建议关注|建议淘汰","briefReason":"一句话总结，30字以内"}';
}

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "仅支持 POST 请求" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "请求格式不正确。" }) }; }

  const { apiKey, question, answer } = body || {};

  // 优先使用请求中的 Key，否则使用服务器环境变量
  const key = (apiKey && apiKey.trim()) || process.env.GLM_API_KEY || "";

  if (!key || key.length === 0)
    return { statusCode: 400, headers, body: JSON.stringify({ error: "请提供有效的 API Key。" }) };
  if (!answer || answer.trim().length === 0)
    return { statusCode: 400, headers, body: JSON.stringify({ error: "候选人回答不能为空。" }) };
  if (answer.trim().length < 20)
    return { statusCode: 400, headers, body: JSON.stringify({ error: "回答内容过短（少于20字），请提供更详细的回答。" }) };

  const questionText = (question && question.trim()) || "未提供面试问题";
  const userMessage = "面试问题：" + questionText + "\n\n候选人回答：" + answer.trim() + "\n\n请基于以上内容进行分析。";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(GLM_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
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
      const map = { 401: "API密钥无效。", 403: "API密钥权限不足。", 429: "请求过于频繁。", 500: "GLM 服务暂时不可用。", 503: "GLM 服务繁忙。" };
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: map[resp.status] || (errMsg ? "API 错误：" + errMsg : "请求失败（" + resp.status + "）") }) };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { statusCode: 500, headers, body: JSON.stringify({ error: "AI 返回内容为空。" }) };

    let parsed, rawText = content;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const m = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1].trim()); rawText = m[1].trim(); } catch { return { statusCode: 200, headers, body: JSON.stringify({ raw: true, rawText, warning: "AI 返回格式异常。" }) }; } }
      else { return { statusCode: 200, headers, body: JSON.stringify({ raw: true, rawText, warning: "AI 返回格式异常。" }) }; }
    }

    if (!parsed.learningSignals || !parsed.initiativeSignals || !parsed.judgment || !parsed.briefReason)
      return { statusCode: 200, headers, body: JSON.stringify({ raw: true, rawText, warning: "AI 返回内容不完整。" }) };

    return { statusCode: 200, headers, body: JSON.stringify({ raw: false, ...parsed }) };
  } catch (err) {
    if (err.name === "AbortError") return { statusCode: 504, headers, body: JSON.stringify({ error: "请求超时（60秒）。" }) };
    return { statusCode: 500, headers, body: JSON.stringify({ error: "分析请求失败：" + err.message }) };
  }
};
