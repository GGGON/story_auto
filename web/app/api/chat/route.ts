import { NextResponse } from 'next/server';

const ARK_API_KEY = process.env.ARK_API_KEY;
const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MODEL = "doubao-seed-1-6-251015";

export async function POST(req: Request) {
  const clientApiKey = req.headers.get("x-ark-api-key");
  const apiKey = clientApiKey || ARK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API Key 未设置。请在页面输入或配置环境变量。" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { messages, system } = body;

    const payloadMessages = [];
    if (system) {
      payloadMessages.push({ role: "system", content: system });
    }
    if (messages) {
      payloadMessages.push(...messages);
    }

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: payloadMessages,
        stream: false,
        max_tokens: 32000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `API Error: ${response.status} - ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({ content });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
