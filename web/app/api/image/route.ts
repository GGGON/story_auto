import { NextResponse } from 'next/server';

const ARK_API_KEY = process.env.ARK_API_KEY;
const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MODEL = "doubao-seedream-4-5-251128";

export async function POST(req: Request) {
  const clientApiKey = req.headers.get("x-ark-api-key");
  const apiKey = clientApiKey || ARK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API Key 未设置。请在页面输入或配置环境变量。" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const response = await fetch(`${BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: prompt,
        width: 1024,
        height: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `API Error: ${response.status} - ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
         return NextResponse.json({ error: "No image URL in response" }, { status: 500 });
    }

    return NextResponse.json({ url: imageUrl });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
