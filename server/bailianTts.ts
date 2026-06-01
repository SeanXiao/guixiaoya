import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import type { BookLanguage, ProtagonistGender } from "./bookStore.js";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedDir = join(rootDir, "data", "generated");

function dashScopeKey() {
  return process.env.DASHSCOPE_API_KEY?.trim() || process.env.BAILIAN_API_KEY?.trim() || "";
}

function ttsModel() {
  return process.env.BAILIAN_TTS_MODEL || "cosyvoice-v3-flash";
}

export function getBailianTtsVoice(gender: ProtagonistGender = "girl", language: BookLanguage = "zh") {
  if (language === "en") {
    if (gender === "boy") {
      return process.env.BAILIAN_TTS_EN_BOY_VOICE || "longshu_v3";
    }
    return process.env.BAILIAN_TTS_EN_GIRL_VOICE || "longmiao_v3";
  }

  if (gender === "boy") {
    return process.env.BAILIAN_TTS_BOY_VOICE || "longjielidou_v3";
  }
  return process.env.BAILIAN_TTS_GIRL_VOICE || "longling_v3";
}

function humanizeForSpeech(text: string, language: BookLanguage) {
  return text
    .replace(/[*_`#>-]/gu, "")
    .replace(/\n+/gu, language === "en" ? ". " : "。")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1800);
}

function getSpeechFileName(text: string, voice: string, language: BookLanguage) {
  const cacheParts = language === "en" ? [ttsModel(), voice, language, text] : [ttsModel(), voice, text];
  const hash = createHash("sha256")
    .update(cacheParts.join("\n"))
    .digest("hex")
    .slice(0, 28);
  return `speech-${hash}.mp3`;
}

type BailianTtsMessage = {
  header?: {
    event?: string;
    error_code?: string;
    error_message?: string;
  };
};

export function getBailianTtsStatus() {
  return {
    ttsModel: ttsModel(),
    girlVoice: getBailianTtsVoice("girl", "zh"),
    boyVoice: getBailianTtsVoice("boy", "zh"),
    englishGirlVoice: getBailianTtsVoice("girl", "en"),
    englishBoyVoice: getBailianTtsVoice("boy", "en")
  };
}

export async function synthesizeBailianSpeech(text: string, gender: ProtagonistGender = "girl", language: BookLanguage = "zh") {
  const apiKey = dashScopeKey();
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

  const safeText = humanizeForSpeech(text, language);
  if (!safeText) {
    throw new Error("speech text is empty");
  }

  const voice = getBailianTtsVoice(gender, language);
  const fileName = getSpeechFileName(safeText, voice, language);
  const filePath = join(generatedDir, fileName);
  try {
    const fileStat = await stat(filePath);
    return {
      audioUrl: `/generated/${fileName}`,
      format: "mp3",
      length: fileStat.size,
      model: ttsModel(),
      voice,
      language,
      cached: true
    };
  } catch {
    // Cache miss; synthesize below.
  }

  const taskId = randomUUID().replace(/-/gu, "");
  const audioChunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket("wss://dashscope.aliyuncs.com/api-ws/v1/inference/", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-DashScope-DataInspection": "enable"
      }
    });

    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("Bailian TTS timed out"));
    }, 60000);

    function finish(error?: Error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    function send(payload: unknown) {
      socket.send(JSON.stringify(payload));
    }

    socket.on("open", () => {
      send({
        header: {
          action: "run-task",
          task_id: taskId,
          streaming: "duplex"
        },
        payload: {
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          model: ttsModel(),
          input: {},
          parameters: {
            text_type: "PlainText",
            voice,
            format: "mp3",
            sample_rate: 24000,
            volume: 50,
            rate: language === "en" ? 0.92 : 1,
            pitch: 1,
            ...(language === "en" ? { language_hints: ["en"] } : {})
          }
        }
      });
    });

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        audioChunks.push(Buffer.from(data as Buffer));
        return;
      }

      const message = JSON.parse(data.toString()) as BailianTtsMessage;
      if (message.header?.event === "task-started") {
        send({
          header: {
            action: "continue-task",
            task_id: taskId,
            streaming: "duplex"
          },
          payload: {
            input: { text: safeText }
          }
        });
        send({
          header: {
            action: "finish-task",
            task_id: taskId,
            streaming: "duplex"
          },
          payload: {
            input: {}
          }
        });
        return;
      }

      if (message.header?.event === "task-failed") {
        finish(new Error(message.header.error_message || message.header.error_code || "Bailian TTS failed"));
        return;
      }

      if (message.header?.event === "task-finished") {
        finish();
      }
    });

    socket.on("error", (error) => finish(error instanceof Error ? error : new Error(String(error))));
  });

  const audio = Buffer.concat(audioChunks);
  if (!audio.length) {
    throw new Error("Bailian TTS returned empty audio");
  }

  await mkdir(generatedDir, { recursive: true });
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, audio);
  }

  return {
    audioUrl: `/generated/${fileName}`,
    format: "mp3",
    length: audio.length,
    model: ttsModel(),
    voice,
    language,
    cached: false
  };
}
