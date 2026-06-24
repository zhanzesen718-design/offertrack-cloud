module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { projectName, techStack, details } = request.body || {};
  if (!projectName || !techStack || !details) {
    response.status(400).json({ error: "Missing projectName, techStack, or details" });
    return;
  }

  try {
    if (process.env.BIGMODEL_API_KEY) {
      const result = await generateWithBigModel({ projectName, techStack, details });
      response.status(200).json({ result });
      return;
    }

    if (process.env.GEMINI_API_KEY) {
      const result = await generateWithGemini({ projectName, techStack, details });
      response.status(200).json({ result });
      return;
    }

    if (process.env.OPENAI_API_KEY) {
      const result = await generateWithOpenAI({ projectName, techStack, details });
      response.status(200).json({ result });
      return;
    }

    response.status(200).json({ result: buildFallback({ projectName, techStack, details }) });
  } catch (error) {
    response.status(500).json({
      error: "AI generation failed",
      result: buildFallback({ projectName, techStack, details }),
    });
  }
};

async function generateWithBigModel({ projectName, techStack, details }) {
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
            "你是资深中文技术简历顾问。请输出 3 条适合新手开发者简历的项目经历 bullet points，强调技术栈、业务价值、个人贡献、跨设备数据同步和可部署结果。不要夸大，不要编造数据。",
        },
        {
          role: "user",
          content: `项目名称：${projectName}\n技术栈：${techStack}\n项目细节：${details}`,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`BigModel API error: ${aiResponse.status}`);
  }

  const data = await aiResponse.json();
  return extractBigModelText(data) || buildFallback({ projectName, techStack, details });
}

async function generateWithGemini({ projectName, techStack, details }) {
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
                text: buildPrompt({ projectName, techStack, details }),
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
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") || buildFallback({ projectName, techStack, details });
}

async function generateWithOpenAI({ projectName, techStack, details }) {
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
            "你是资深中文技术简历顾问。请输出 3 条适合新手开发者简历的项目经历 bullet points，强调技术栈、业务价值、个人贡献、跨设备数据同步和可部署结果。不要夸大，不要编造数据。",
        },
        {
          role: "user",
          content: `项目名称：${projectName}\n技术栈：${techStack}\n项目细节：${details}`,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`OpenAI API error: ${aiResponse.status}`);
  }

  const data = await aiResponse.json();
  return data.output_text || extractOpenAIText(data) || buildFallback({ projectName, techStack, details });
}

function buildPrompt({ projectName, techStack, details }) {
  return [
    "你是资深中文技术简历顾问。请输出 3 条适合新手开发者简历的项目经历 bullet points。",
    "要求：强调技术栈、业务价值、个人贡献、跨设备数据同步和可部署结果；不要夸大，不要编造数据。",
    `项目名称：${projectName}`,
    `技术栈：${techStack}`,
    `项目细节：${details}`,
  ].join("\n");
}

function buildFallback({ projectName, techStack, details }) {
  const conciseDetails = details.length > 90 ? `${details.slice(0, 90)}...` : details;
  return [
    `- 基于 ${techStack} 开发并部署 ${projectName}，覆盖工作/实习投递记录、状态追踪、跟进提醒、跨设备云端同步和数据导入导出等核心流程。`,
    "- 使用 Supabase Auth、PostgreSQL 和 Row Level Security 实现用户登录、云端数据持久化与多用户数据隔离。",
    `- 集成 AI 简历文案生成接口，将项目经历自动转化为结构化简历 bullet points；项目贡献包括：${conciseDetails}`,
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
