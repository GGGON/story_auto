import { Character, StoryNode } from "@/types/story";

export const SYSTEM_PROMPT = `你是一个高级互动故事引擎。
规则：
1. 严格输出有效的 JSON 格式。不要使用 markdown 格式化（如 \`\`\`json）。
2. 语言：简体中文。
3. 视角：始终使用当前角色的第一人称（“我”）。禁止上帝视角/全知视角。
4. 风格：沉浸式，小说化，专注于感官细节和内心独白。
`;

export const EXTRACT_CHARACTERS_PROMPT = (userText: string, count: number = 3) => `
分析以下文本并提取正好 ${count} 个主要角色。
如果文本较短或抽象，请根据主题创造性地构思 ${count} 个独特的角色。
返回 JSON 格式：
{
  "characters": [
    { "id": "char_1", "name": "姓名", "bio": "简短传记", "traits": ["特征1", "特征2"] },
    ...
  ]
}

文本： "${userText}"
`;

export const GENERATE_START_PROMPT = (characters: Character[], originalText: string, imageStyle: string = "Cinematic") => `
从第一个角色：${characters[0].name} 的视角开始故事。

**核心指令**：
1. **开篇复刻**：故事的开端必须与原始文本的**起始片段**几乎完全一致。请直接改编原文的开头部分，将其转换为当前角色的第一人称（“我”）视角。保留原文的描写、对话和氛围。
2. **仅限开端**：**严禁**剧透或包含原始文本中后续发生的剧情。你只能生成故事的起点，相当于小说的第一章或第一个场景。
3. **选项逻辑**：生成的选项必须**紧密衔接**开篇文本的结尾状态。选项应该是角色在当前情境下立即可以采取的微小行动或心理抉择，**不要**包含长远的剧情规划。
4. **沉浸体验**：建立初始设定和当前场景，等待用户做出选择来推动故事发展。

原始文本：
"${originalText}"

返回 JSON 格式：
{
  "summary": "简短客观的情况摘要",
  "content": "以 ${characters[0].name} 第一人称视角撰写的故事文本，必须高度还原原文开篇...",
  "options": [
    { "id": "opt_1", "label": "行动 1", "next_action_hint": "基于当前情境的直接反应（符合原文逻辑）" },
    { "id": "opt_2", "label": "行动 2", "next_action_hint": "尝试不同的可能性（探索性分支）" }
  ],
  "image_prompt": "Detailed English image prompt for ${imageStyle} style. Describe the scene visually including characters, environment, lighting. Start with '${imageStyle} style'.",
  "education": {
    "knowledge_points": [
      { "question": "该段落涉及的语文知识点（如修辞手法、成语运用等）", "answer": "对该知识点的详细解析和用法说明" }
    ],
    "thinking_questions": [
      { "question": "针对该段落的深度思考问题", "answer": "问题的参考答案或引导性解析" }
    ]
  }
}

角色背景：
${JSON.stringify(characters)}
`;

export const CONTINUE_PROMPT = (
  historySummary: string,
  lastContent: string,
  currentCharacter: Character,
  actionHint: string,
  isEnding: boolean = false,
  imageStyle: string = "Cinematic"
) => `
从 ${currentCharacter.name} 的视角继续故事。
前情提要：${historySummary}
上一场景：${lastContent}
采取的行动：${actionHint}

${isEnding ? "这是故事的结局。请根据之前的选择和发展，为故事画上句号。不要提供后续行动选项。" : "撰写下一个场景。对行动做出反应。"}

返回 JSON 格式：
{
  "summary": "包含此事件的更新摘要",
  "content": "第一人称视角的故事文本...",
  "options": [
    ${isEnding ? "" : `{ "id": "opt_1", "label": "选项 1", "next_action_hint": "..." },
    { "id": "opt_2", "label": "选项 2", "next_action_hint": "..." }`}
  ],
  "image_prompt": "Detailed English image prompt for ${imageStyle} style. Describe the scene visually including characters, environment, lighting. Start with '${imageStyle} style'.",
  "education": {
    "knowledge_points": [
      { "question": "该段落涉及的语文知识点（如修辞手法、成语运用等）", "answer": "对该知识点的详细解析和用法说明" }
    ],
    "thinking_questions": [
      { "question": "针对该段落的深度思考问题", "answer": "问题的参考答案或引导性解析" }
    ]
  }
}
`;

export const SPLIT_STORY_PROMPT = (text: string, count: number = 5, imageStyle: string = "Cinematic") => `
将以下文本拆分为 ${count} 个连贯的故事情节节点。
**重要指令**：
1. **JSON 完整性**：必须确保返回的 JSON 格式完整，切勿在字符串中间截断。如果文本过长，请适当精简 image_prompt 和 education 内容，优先保证 segments 的 content 完整。
2. **原文拆分**：每个节点的内容必须是原文的直接摘录或拆分，**不要**进行改写或创作，确保所有节点按顺序拼接起来就是完整的原文。
3. **节点完整性**：每个节点应包含完整的段落或场景，字数分配尽量均匀。
4. **配图与教育**：为每个节点生成简短的 ${imageStyle} 风格图片描述和 1 个关键语文知识点、1 个思考题。

原始文本：
"${text}"

返回 JSON 格式：
{
  "segments": [
    {
      "summary": "简短概括",
      "content": "原文片段...",
      "image_prompt": "Brief ${imageStyle} style prompt...",
      "education": {
        "knowledge_points": [
          { "question": "核心知识点", "answer": "简析" }
        ],
        "thinking_questions": [
          { "question": "核心思考题", "answer": "简析" }
        ]
      }
    }
  ]
}
`;

export const REWRITE_PROMPT = (
  node: StoryNode,
  newCharacter: Character,
  allCharacters: Character[],
  imageStyle: string = "Cinematic"
) => `
从 ${newCharacter.name} 的视角重写以下场景。
事件和结果必须保持不变，但内心想法、观察和情感反应必须反映 ${newCharacter.name} 的个性。
如果 ${newCharacter.name} 不在场，请描述他们如何从所在位置感知该事件，或者如何同时听到/对该事件做出反应。

原始场景（摘要）：${node.summary}
原始文本：${node.content}

返回 JSON 格式：
{
  "summary": "${node.summary}",
  "content": "以 ${newCharacter.name} 第一人称视角重写的故事文本...",
  "options": [
    { "id": "opt_1", "label": "${newCharacter.name} 的独特选项", "next_action_hint": "..." },
    { "id": "opt_2", "label": "另一个选项", "next_action_hint": "..." }
  ],
  "image_prompt": "Detailed English image prompt for ${imageStyle} style. Describe the scene visually including characters, environment, lighting. Start with '${imageStyle} style'.",
  "education": {
    "knowledge_points": [
      { "question": "该段落涉及的语文知识点（如修辞手法、成语运用等）", "answer": "对该知识点的详细解析和用法说明" }
    ],
    "thinking_questions": [
      { "question": "针对该段落的深度思考问题", "answer": "问题的参考答案或引导性解析" }
    ]
  }
}
`;
