import type { MemoryFact } from "./memoryStore.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type MiniMaxChatResult = {
  text: string;
  rawModel?: string;
  usage?: unknown;
};

function getApiKey() {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is missing. Create .env from .env.example first.");
  }
  return apiKey;
}

function baseUrl() {
  return (process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1").replace(/\/+$/u, "");
}

function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/giu, "").trim();
}

function humanizeForSpeech(text: string) {
  return text
    .replace(/[*_`#>-]/gu, "")
    .replace(/\n+/gu, "。")
    .replace(/[。！？!?]/gu, (mark) => `${mark}<#0.28#>`)
    .replace(/[，,；;]/gu, (mark) => `${mark}<#0.16#>`)
    .replace(/(<#0\.\d+#>){2,}/gu, "<#0.3#>")
    .replace(/<#0\.\d+#>$/u, "")
    .trim();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => null)) as T & {
    error?: { message?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };

  if (!response.ok) {
    throw new Error(payload?.error?.message || `MiniMax request failed with HTTP ${response.status}`);
  }

  if (payload?.base_resp && payload.base_resp.status_code !== 0) {
    throw new Error(payload.base_resp.status_msg || "MiniMax returned an error response");
  }

  return payload;
}

export function buildSystemPrompt(memories: MemoryFact[]) {
  const memoryText = memories.length
    ? memories.map((item, index) => `${index + 1}. ${item.text}`).join("\n")
    : "暂时还没有长期记忆。";

  return [
    "你叫“小圆”，是一个给小学生使用的 AI 陪伴机器人。",
    "你要像温暖、耐心、积极的学习伙伴一样对话。",
    "回复使用简体中文，通常 1 到 4 句话，适合 6 到 12 岁孩子听懂。",
    "不要使用 emoji 或网络梗，语气可以活泼但要清楚。",
    "如果孩子分享名字、喜好、今天发生的事情，要自然回应“我记住啦”。",
    "不要索要或保存手机号、住址、密码、身份证、银行卡等隐私。",
    "如果孩子说遇到危险、身体不舒服、被欺负或很难过，要温柔建议马上找家长、老师或可信任的大人帮忙。",
    "下面是你已经知道的长期记忆，回答时可以自然使用：",
    memoryText
  ].join("\n");
}

export async function chatWithMiniMax(messages: ChatMessage[]): Promise<MiniMaxChatResult> {
  const model = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
  const payload = await postJson<{
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: unknown;
  }>("/chat/completions", {
    model,
    messages,
    stream: false,
    temperature: 0.8,
    max_tokens: 600
  });

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("MiniMax did not return assistant content");
  }

  return {
    text: stripThinking(content),
    rawModel: payload.model,
    usage: payload.usage
  };
}

export async function synthesizeSpeech(text: string) {
  const ttsModel = process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd";
  const voiceId = process.env.MINIMAX_TTS_VOICE || "Chinese (Mandarin)_Warm_Girl";
  const safeText = humanizeForSpeech(text).slice(0, 1200);

  const payload = await postJson<{
    data?: { audio?: string; status?: number };
    extra_info?: { audio_format?: string; audio_length?: number };
  }>("/t2a_v2", {
    model: ttsModel,
    text: safeText,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: 1.12,
      vol: 1,
      pitch: 0,
      emotion: "happy"
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1
    },
    language_boost: "Chinese",
    subtitle_enable: false,
    output_format: "hex"
  });

  const audioHex = payload.data?.audio;
  if (!audioHex) {
    throw new Error("MiniMax TTS did not return audio");
  }

  const audioBase64 = Buffer.from(audioHex, "hex").toString("base64");
  return {
    audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
    format: payload.extra_info?.audio_format || "mp3",
    length: payload.extra_info?.audio_length
  };
}
