"use client";

import { useState, useEffect } from "react";
import { Character, GameState, StoryNode } from "@/types/story";
import {
  SYSTEM_PROMPT,
  EXTRACT_CHARACTERS_PROMPT,
  GENERATE_START_PROMPT,
  CONTINUE_PROMPT,
  REWRITE_PROMPT,
  SPLIT_STORY_PROMPT,
} from "@/lib/prompts";

const IMAGE_STYLES = [
  { value: "Cinematic", label: "电影感" },
  { value: "Anime", label: "动漫" },
  { value: "Watercolor", label: "水彩" },
  { value: "Cyberpunk", label: "赛博朋克" },
  { value: "Chinese Ink", label: "水墨画" },
  { value: "Oil Painting", label: "油画" },
  { value: "Pixel Art", label: "像素风" },
  { value: "Realistic", label: "写实" },
];

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [charCount, setCharCount] = useState(3);
  const [maxNodes, setMaxNodes] = useState(10); // Default max nodes
  const [inputText, setInputText] = useState("");
  const [imageStyle, setImageStyle] = useState("Cinematic");
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  const [mode, setMode] = useState<"interactive" | "reader">("interactive");
  const [splitCount, setSplitCount] = useState(5);

  // Load from LocalStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem("story_auto_apikey");
    if (savedApiKey) setApiKey(savedApiKey);

    const saved = localStorage.getItem("story_auto_state");
    if (saved) {
      try {
        setGameState(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
  }, []);

  // Save to LocalStorage on change
  useEffect(() => {
    if (gameState) {
      localStorage.setItem("story_auto_state", JSON.stringify(gameState));
    }
  }, [gameState]);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("story_auto_apikey", apiKey);
    }
  }, [apiKey]);

  const callAI = async (prompt: string) => {
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["x-ark-api-key"] = apiKey;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Clean JSON
      let content = data.content;
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();
      
      try {
        return JSON.parse(content);
      } catch (e) {
        console.error("JSON Parse Error:", e);
        // Attempt simple repair for unterminated string if it's the very end
        // This is a very naive check but might help simple truncation
        if (e instanceof SyntaxError && e.message.includes("Unterminated string")) {
           try {
              // Try appending quote and brace? Highly risky but better than crash.
              // Actually, better to just throw specific error user can understand.
              throw new Error("生成的内容过长被截断，请尝试减少拆分段数或缩短原文。");
           } catch (ignored) {}
        }
        throw new Error("生成格式错误 (JSON Parse Error)");
      }
    } catch (e: any) {
      setError(e.message || "发生错误");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async (prompt: string) => {
    setImageLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["x-ark-api-key"] = apiKey;
      }
      const res = await fetch("/api/image", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.url;
    } catch (e) {
      console.error("Image generation failed", e);
      return null;
    } finally {
      setImageLoading(false);
    }
  };

  const handleStart = async () => {
    if (!inputText) return;
    if (!apiKey) {
      setError("请输入 API Key");
      return;
    }
    
    // Always extract characters first (needed for both modes to support switching)
    const charData = await callAI(EXTRACT_CHARACTERS_PROMPT(inputText, charCount));
    if (!charData || !charData.characters) return;
    const characters: Character[] = charData.characters;

    // Mode specific logic
    if (mode === "reader") {
      const splitData = await callAI(SPLIT_STORY_PROMPT(inputText, splitCount, imageStyle));
      if (!splitData || !splitData.segments) return;

      const segments: any[] = splitData.segments;
      const storySequence: StoryNode[] = segments.map((seg, index) => ({
        ...seg,
        id: `seg_${Date.now()}_${index}`,
        character_id: "reader", // Virtual character
        options: index < segments.length - 1 
          ? [{ id: "next", label: "下一章", next_action_hint: "继续阅读" }] 
          : [],
      }));

      // Generate first image
      const firstNode = storySequence[0];
      if (firstNode.image_prompt) {
        const imageUrl = await generateImage(firstNode.image_prompt);
        if (imageUrl) {
          firstNode.image_url = imageUrl;
        }
      }

      setGameState({
        characters: characters, // Store characters even in reader mode
        history: [],
        currentNode: firstNode,
        maxNodes: segments.length,
        mode: "reader",
        storySequence: storySequence,
      });

      return;
    }

    // Interactive Mode Logic
    // 2. Generate First Scene
    const startNodeData = await callAI(GENERATE_START_PROMPT(characters, inputText, imageStyle));
    if (!startNodeData) return;

    const startNode: StoryNode = {
      ...startNodeData,
      id: Date.now().toString(),
      character_id: characters[0].id,
    };

    const newGameState: GameState = {
      characters,
      history: [],
      currentNode: startNode,
      maxNodes,
    };

    setGameState(newGameState);

    // 3. Generate Image
    if (startNodeData.image_prompt) {
      const imageUrl = await generateImage(startNodeData.image_prompt);
      if (imageUrl) {
        setGameState(prev => {
          if (!prev || !prev.currentNode) return prev;
          return {
            ...prev,
            currentNode: { ...prev.currentNode, image_url: imageUrl }
          };
        });
      }
    }
  };

  const handleOption = async (optionLabel: string, hint: string) => {
    if (!gameState || !gameState.currentNode) return;
    
    // Check if we are in a sequence-based flow (Reader Mode or Interactive derived from Reader)
    const isInSequence = !!gameState.storySequence;
    
    if (isInSequence) {
        // Determine current sequence index
        let currentSequenceIndex = -1;
        
        if (gameState.mode === "reader") {
            currentSequenceIndex = gameState.storySequence!.findIndex(n => n.id === gameState.currentNode!.id);
        } else if (gameState.mode === "interactive" && gameState.currentNode!.reader_version_id) {
            currentSequenceIndex = gameState.storySequence!.findIndex(n => n.id === gameState.currentNode!.reader_version_id);
        }

        if (currentSequenceIndex !== -1) {
             const nextNodeReader = gameState.storySequence![currentSequenceIndex + 1];
             
             if (nextNodeReader) {
                 // Ensure next node has image
                 if (nextNodeReader.image_prompt && !nextNodeReader.image_url) {
                    const imageUrl = await generateImage(nextNodeReader.image_prompt);
                    if (imageUrl) nextNodeReader.image_url = imageUrl;
                 }

                 if (gameState.mode === "reader") {
                     // Just advance to next reader node
                     setGameState(prev => ({
                         ...prev!,
                         history: [...prev!.history, prev!.currentNode!],
                         currentNode: nextNodeReader
                     }));
                 } else {
                     // Advance to next node but KEEP interactive mode -> Convert next reader node to interactive
                     // We need to auto-convert the next reader node
                     const targetChar = gameState.characters.find(c => c.id === gameState.currentNode!.character_id) || gameState.characters[0];
                     
                     const interactiveData = await callAI(
                        REWRITE_PROMPT(nextNodeReader, targetChar, gameState.characters, imageStyle)
                     );
                     
                     if (interactiveData) {
                        const nextInteractiveNode: StoryNode = {
                            ...interactiveData,
                            id: `interactive_${nextNodeReader.id}`,
                            character_id: targetChar.id,
                            reader_version_id: nextNodeReader.id
                        };
                        
                        if (interactiveData.image_prompt) {
                             const imageUrl = await generateImage(interactiveData.image_prompt);
                             if (imageUrl) nextInteractiveNode.image_url = imageUrl;
                        }

                        setGameState(prev => ({
                            ...prev!,
                            history: [...prev!.history, prev!.currentNode!],
                            currentNode: nextInteractiveNode
                        }));
                     }
                 }
                 return;
             } else {
                 // End of sequence
                 alert("故事已结束");
                 return;
             }
        }
    }
    
    // Fallback to pure interactive mode logic (infinite generation) if not in sequence or sequence broken
    const currentChar = gameState.characters.find(c => c.id === gameState.currentNode!.character_id)!;
    const isEnding = gameState.history.length + 1 >= gameState.maxNodes;
    
    const newNodeData = await callAI(
      CONTINUE_PROMPT(gameState.currentNode.summary, gameState.currentNode.content, currentChar, hint, isEnding, imageStyle)
    );

    if (!newNodeData) return;

    const newNode: StoryNode = {
      ...newNodeData,
      id: Date.now().toString(),
      character_id: currentChar.id,
    };

    // Update state with text first
    setGameState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        history: [...prev.history, prev.currentNode!],
        currentNode: newNode,
      };
    });

    // Generate Image
    if (newNodeData.image_prompt) {
      const imageUrl = await generateImage(newNodeData.image_prompt);
      if (imageUrl) {
        setGameState(prev => {
          if (!prev || !prev.currentNode) return prev;
          // Ensure we are updating the correct node (simple check)
          if (prev.currentNode.id !== newNode.id) return prev;
          
          return {
            ...prev,
            currentNode: { ...prev.currentNode, image_url: imageUrl }
          };
        });
      }
    }
  };

  const switchCharacter = async (charId: string) => {
    if (!gameState || !gameState.currentNode) return;
    if (gameState.currentNode.character_id === charId) return;

    const targetChar = gameState.characters.find(c => c.id === charId)!;
    
    const rewrittenData = await callAI(
      REWRITE_PROMPT(gameState.currentNode, targetChar, gameState.characters, imageStyle)
    );

    if (!rewrittenData) return;

    const rewrittenNode: StoryNode = {
      ...rewrittenData,
      id: Date.now().toString(),
      character_id: charId,
    };

    setGameState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        currentNode: rewrittenNode,
      };
    });

    // Generate Image for rewritten scene (new perspective might have different visual focus)
    if (rewrittenData.image_prompt) {
      const imageUrl = await generateImage(rewrittenData.image_prompt);
      if (imageUrl) {
        setGameState(prev => {
          if (!prev || !prev.currentNode) return prev;
          if (prev.currentNode.id !== rewrittenNode.id) return prev;
          return {
            ...prev,
            currentNode: { ...prev.currentNode, image_url: imageUrl }
          };
        });
      }
    }
  };

  const toggleViewMode = async () => {
    if (!gameState || !gameState.currentNode) return;
    
    // Switch from Reader to Interactive
    if (gameState.mode === "reader") {
      // If already has interactive version cached, use it
      if (gameState.currentNode.interactive_version_id) {
         // This implies we need a way to store/retrieve it. 
         // For simplicity, let's look in a potential cache or just re-generate if not easily accessible.
         // Actually, let's just regenerate for now to keep state simple, or check if we stored it in storySequence (which we can't easily modify structurally).
         // Better: Let's assume we regenerate or we store "interactive_nodes" map in GameState? 
         // For this MVP, let's regenerate.
      }

      // Pick a default character (e.g. first one)
      const targetChar = gameState.characters[0];
      if (!targetChar) {
          alert("没有可用角色，无法切换到互动模式");
          return;
      }

      // Use REWRITE_PROMPT to convert current reader node (original text) to interactive
      // Treat the reader node as the "original scene"
      const interactiveData = await callAI(
        REWRITE_PROMPT(gameState.currentNode, targetChar, gameState.characters, imageStyle)
      );
      
      if (!interactiveData) return;

      const interactiveNode: StoryNode = {
        ...interactiveData,
        id: `interactive_${gameState.currentNode.id}`,
        character_id: targetChar.id,
        reader_version_id: gameState.currentNode.id, // Link back to reader node
        // Ensure options link to NEXT reader node logic (will be handled in handleOption)
      };

      // Generate Image
      if (interactiveData.image_prompt) {
         const imageUrl = await generateImage(interactiveData.image_prompt);
         if (imageUrl) interactiveNode.image_url = imageUrl;
      }

      setGameState(prev => {
        if (!prev) return null;
        return {
          ...prev,
          mode: "interactive",
          currentNode: interactiveNode,
        };
      });
      return;
    }

    // Switch from Interactive to Reader
    if (gameState.mode === "interactive") {
       // Check if we have a linked reader node
       if (gameState.currentNode.reader_version_id && gameState.storySequence) {
          const readerNode = gameState.storySequence.find(n => n.id === gameState.currentNode!.reader_version_id);
          if (readerNode) {
             setGameState(prev => ({
               ...prev!,
               mode: "reader",
               currentNode: readerNode,
             }));
             return;
          }
       }
       
       // Fallback: If no direct link (maybe started in interactive mode?), we can't switch to reader easily
       // But based on user request "can switch to original mode", we assume it's possible.
       // If started in Reader mode, storySequence exists.
       if (gameState.storySequence) {
           // Try to find which segment we are close to? Or just return to the first one?
           // Or maybe we track "currentSegmentIndex".
           // For now, if we can't find the link, alert user.
           alert("无法找到对应的原文片段（可能您已经偏离了主线）");
       } else {
           alert("此故事未包含原文数据，无法切换到原文模式");
       }
    }
  };

  const resetGame = () => {
    if (confirm("确定要重置故事吗？")) {
      setGameState(null);
      localStorage.removeItem("story_auto_state");
      setInputText("");
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            互动故事引擎
          </h1>
          {gameState && (
            <div className="flex items-center gap-4">
               {/* Mode Toggle Button - Only show if storySequence is available (meaning switch is possible) */}
               {gameState.storySequence && (
                   <button 
                     onClick={toggleViewMode}
                     disabled={loading}
                     className="text-sm px-3 py-1 rounded border border-purple-500 text-purple-400 hover:bg-purple-900/30 transition-colors disabled:opacity-50"
                   >
                     {gameState.mode === "reader" ? "进入互动模式" : "切换原文模式"}
                   </button>
               )}
               <span className="text-sm text-gray-400">
                 进度: {gameState.history.length} / {gameState.maxNodes}
               </span>
               <button onClick={resetGame} className="text-sm text-gray-400 hover:text-white underline">
                重置
               </button>
            </div>
          )}
        </header>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded mb-6">
            错误: {error}
          </div>
        )}

        {!gameState ? (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-sm text-gray-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">模式选择</label>
                <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                  <button
                    onClick={() => setMode("interactive")}
                    className={`flex-1 py-1 px-2 rounded text-sm transition-colors ${
                      mode === "interactive" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    互动扮演
                  </button>
                  <button
                    onClick={() => setMode("reader")}
                    className={`flex-1 py-1 px-2 rounded text-sm transition-colors ${
                      mode === "reader" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    原文阅读
                  </button>
                </div>
              </div>
              
              {mode === "interactive" ? (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">角色数量</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={charCount}
                      onChange={(e) => setCharCount(parseInt(e.target.value) || 3)}
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">最大节点数</label>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={maxNodes}
                      onChange={(e) => setMaxNodes(parseInt(e.target.value) || 10)}
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">拆分段数</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={splitCount}
                    onChange={(e) => setSplitCount(parseInt(e.target.value) || 5)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">图片风格</label>
                <select
                  value={imageStyle}
                  onChange={(e) => setImageStyle(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {IMAGE_STYLES.map(style => (
                    <option key={style.value} value={style.value}>{style.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">故事背景 / 初始文本</label>
              <textarea
                className="w-full h-48 bg-gray-800 border border-gray-700 rounded p-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="例如：在赛博朋克城市中，一名侦探和一名黑客联手窃取公司机密..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>
            
            <button
              onClick={handleStart}
              disabled={loading || !inputText || !apiKey}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:opacity-50 transition-colors"
            >
              {loading ? "初始化中..." : "开始故事"}
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_300px] gap-6">
            {/* Main Story Area */}
            <div className="space-y-6">
              {/* Character Tabs (Only in Interactive Mode) */}
              {gameState.mode !== "reader" && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {gameState.characters.map(char => (
                  <button
                    key={char.id}
                    onClick={() => switchCharacter(char.id)}
                    disabled={loading || imageLoading}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      gameState.currentNode?.character_id === char.id
                        ? "bg-purple-600 text-white shadow-lg shadow-purple-900/50 scale-105"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {char.name}
                  </button>
                ))}
              </div>
              )}

              {/* Story Content & Image */}
              <div className="bg-gray-800 rounded-xl overflow-hidden shadow-2xl border border-gray-700">
                {/* Image Section */}
                <div className="w-full h-64 md:h-80 bg-black relative">
                   {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
                         <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                         <span className="ml-2 text-sm text-gray-300">生成配图中...</span>
                      </div>
                   )}
                   {gameState.currentNode?.image_url ? (
                     // eslint-disable-next-line @next/next/no-img-element
                     <img 
                       src={gameState.currentNode.image_url} 
                       alt="Story Scene" 
                       className="w-full h-full object-cover"
                     />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-gray-600">
                        {imageLoading ? "" : "暂无配图"}
                     </div>
                   )}
                </div>

                {/* Text Content */}
                <div className="p-6 md:p-8 relative min-h-[200px]">
                   {loading && (
                    <div className="absolute inset-0 bg-gray-800/80 flex items-center justify-center z-10 rounded-b-xl">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                    </div>
                  )}
                  <div className="prose prose-invert max-w-none leading-relaxed text-lg text-gray-200">
                     {gameState.currentNode?.content.split('\n').map((p, i) => (
                       <p key={i} className="mb-4">{p}</p>
                     ))}
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="grid gap-3">
                {gameState.currentNode?.options.length === 0 ? (
                    <div className="text-center p-8 bg-gray-800/50 rounded-lg border border-gray-700">
                        <h3 className="text-xl font-bold text-yellow-500 mb-2">故事结束</h3>
                        <p className="text-gray-400">感谢体验！您可以点击右上角重置开始新的故事。</p>
                    </div>
                ) : (
                    gameState.currentNode?.options.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => handleOption(opt.label, opt.next_action_hint)}
                        disabled={loading}
                        className="text-left p-4 bg-gray-800/50 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg transition-all group"
                    >
                        <span className="font-semibold text-blue-400 group-hover:text-blue-300 block mb-1">
                        {opt.label}
                        </span>
                        <span className="text-sm text-gray-500 group-hover:text-gray-400">
                        {opt.next_action_hint}
                        </span>
                    </button>
                    ))
                )}
              </div>
            </div>

            {/* Sidebar: Education & Info */}
            <div className="space-y-6">
               {/* Education Section */}
               {gameState.currentNode?.education && (
                   <div className="bg-gray-800 rounded-lg p-4 border border-blue-900/50 shadow-blue-900/20 shadow-lg">
                      <h3 className="text-blue-400 text-sm uppercase tracking-wider font-bold mb-3 flex items-center">
                          <span className="mr-2">📚</span> 语文知识点
                      </h3>
                      <ul className="list-none space-y-4 mb-6">
                          {gameState.currentNode.education.knowledge_points.map((kp, i) => (
                              <li key={i} className="text-sm">
                                <div className="font-semibold text-gray-200 mb-1">{kp.question}</div>
                                <div className="text-gray-400 text-xs pl-2 border-l-2 border-blue-500/50">
                                  {kp.answer}
                                </div>
                              </li>
                          ))}
                      </ul>
                      
                      <div className="border-t border-gray-700 pt-3">
                        <h3 className="text-purple-400 text-sm uppercase tracking-wider font-bold mb-3 flex items-center">
                            <span className="mr-2">🤔</span> 思考题
                        </h3>
                        <ul className="list-none space-y-4">
                            {gameState.currentNode.education.thinking_questions.map((q, i) => (
                                <li key={i} className="text-sm">
                                  <div className="font-semibold text-gray-200 mb-1">{q.question}</div>
                                  <div className="text-gray-400 text-xs pl-2 border-l-2 border-purple-500/50">
                                    {q.answer}
                                  </div>
                                </li>
                            ))}
                        </ul>
                      </div>
                   </div>
               )}

               {/* Current Perspective (Only in Interactive Mode) */}
               {gameState.mode !== "reader" && (
               <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-3">当前视角</h3>
                  {(() => {
                    const char = gameState.characters.find(c => c.id === gameState.currentNode?.character_id);
                    if (!char) return null;
                    return (
                      <div>
                        <div className="text-xl font-bold text-white mb-2">{char.name}</div>
                        <p className="text-sm text-gray-400 italic mb-3">{char.bio}</p>
                        <div className="flex flex-wrap gap-2">
                          {char.traits.map(t => (
                            <span key={t} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">{t}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
               </div>
               )}

               <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-3">历史记录</h3>
                  <div className="text-sm text-gray-500 space-y-2 max-h-[200px] overflow-y-auto">
                    {gameState.history.length === 0 && <p>序幕</p>}
                    {gameState.history.map((node, i) => (
                      <div key={i} className="border-l-2 border-gray-700 pl-2">
                         第 {i + 1} 回合: {node.summary.slice(0, 50)}...
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
