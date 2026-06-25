module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { projectName, keywords = "", techStack = "", details } = request.body || {};
  const experienceKeywords = keywords || techStack;
  if (!projectName || !details) {
    response.status(400).json({ error: "Missing projectName or details" });
    return;
  }

  const payload = { projectName, keywords: experienceKeywords, details };

  try {
    if (process.env.BIGMODEL_API_KEY) {
      const result = await retryAI(() => generateWithBigModel(payload));
      response.status(200).json({ result, source: "bigmodel" });
      return;
    }

    if (process.env.GEMINI_API_KEY) {
      const result = await retryAI(() => generateWithGemini(payload));
      response.status(200).json({ result, source: "gemini" });
      return;
    }

    if (process.env.OPENAI_API_KEY) {
      const result = await retryAI(() => generateWithOpenAI(payload));
      response.status(200).json({ result, source: "openai" });
      return;
    }

    response.status(200).json({ result: buildFallback(payload), source: "fallback" });
  } catch (error) {
    response.status(200).json({
      result: buildFallback(payload),
      source: "fallback",
      error: error.message || "AI generation failed",
    });
  }
};

async function retryAI(task, attempts = 3) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        await delay(500 * (index + 1));
      }
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithBigModel({ projectName, keywords, details }) {
  const aiResponse = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BIGMODEL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.BIGMODEL_MODEL || "glm-4.7-flash",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "你是资深中文简历顾问。请输出 3 条适合简历使用的经历描述，可以是项目、实习、校园、活动、运营或职能类经历。若用户提供关键词，则自然融入；若没有，则不要强行写技术栈。强调目标、职责、个人贡献、结果和可量化价值；不要夸大，不要编造数据。",
        },
        {
          role: "user",
          content: `经历名称：${projectName}\n关键词：${keywords || "未提供"}\n经历细节：${details}`,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`BigModel API error: ${aiResponse.status}`);
  }

  const data = await aiResponse.json();
  return extractBigModelText(data) || buildFallback({ projectName, keywords, details });
}

async function generateWithGemini({ projectName, keywords, details }) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const apiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildPrompt({ projectName, keywords, details }),
              },
            ],
          },
        ],
      }),
    },
  );

  if (!apiResponse.ok) {
    throw new Error(`Gemini API error: ${apiResponse.status}`);
  }

  const data = await apiResponse.json();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") || buildFallback({ projectName, keywords, details });
}

async function generateWithOpenAI({ projectName, keywords, details }) {
  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "你是资深中文简历顾问。请输出 3 条适合简历使用的经历描述，可以是项目、实习、校园、活动、运营或职能类经历。若用户提供关键词，则自然融入；若没有，则不要强行写技术栈。强调目标、职责、个人贡献、结果和可量化价值；不要夸大，不要编造数据。",
        },
        {
          role: "user",
          content: `经历名称：${projectName}\n关键词：${keywords || "未提供"}\n经历细节：${details}`,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`OpenAI API error: ${aiResponse.status}`);
  }

  const data = await aiResponse.json();
  return data.output_text || extractOpenAIText(data) || buildFallback({ projectName, keywords, details });
}

function buildPrompt({ projectName, keywords, details }) {
  return [
    "你是资深中文简历顾问。请输出 3 条适合简历使用的经历描述，可以是项目、实习、校园、活动、运营或职能类经历。",
    "要求：若提供关键词则自然融入；若未提供则不要强行写技术栈。强调目标、职责、个人贡献、结果和业务价值；不要夸大，不要编造数据。",
    `经历名称：${projectName}`,
    `关键词：${keywords || "未提供"}`,
    `经历细节：${details}`,
  ].join("\n");
}

function buildFallback({ projectName, keywords, details }) {
  const conciseDetails = details.length > 90 ? `${details.slice(0, 90)}...` : details;
  const keywordText = keywords ? `，可结合 ${keywords} 等关键词展开` : "";
  return [
    `- 围绕 ${projectName} 提炼出适合简历呈现的经历亮点，突出目标、职责分工、执行过程与结果${keywordText}。`,
    "- 将原始经历整理为更清晰的简历表达，帮助在投递中更准确地呈现个人贡献、协作内容和实际产出。",
    `- 根据提供的经历细节生成可直接复用的简历要点，核心内容包括：${conciseDetails}`,
  ].join("\n");
}

function extractOpenAIText(data) {
  return data?.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text)
    ?.filter(Boolean)
    ?.join("\n");
}

function extractBigModelText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content)
      .filter(Boolean)
      .join("\n");
  }

  return "";
}
