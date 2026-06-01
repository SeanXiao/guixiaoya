import { synthesizePictureBookSpeech } from "./pictureBookApi";
import type { BookLanguage, ProtagonistGender } from "./types";

let speechRunId = 0;
let activeAudio: HTMLAudioElement | null = null;
let resolveActiveAudio: (() => void) | null = null;
let resolveActiveUtterance: (() => void) | null = null;

function splitSpeechText(text: string) {
  return text
    .replace(/\s+/gu, " ")
    .split(/(?<=[。！？!?])|(?<=\.)\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanSpeechText(text: string) {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function getBrowserVoices() {
  if (!window.speechSynthesis) {
    return Promise.resolve<SpeechSynthesisVoice[]>([]);
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    return Promise.resolve(voices);
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 700);
  });
}

function scoreEnglishVoice(voice: SpeechSynthesisVoice, protagonistGender: ProtagonistGender) {
  const name = voice.name || "";
  const lang = voice.lang || "";
  const preferredAny = /Google US English|Samantha|Alex|Ava|Allison|Susan|Tom|Daniel|Karen|Moira|Tessa|Jenny|Aria|Zira|David|Guy|Arthur|Martha/iu;
  const preferredGirl = /Samantha|Ava|Allison|Susan|Jenny|Aria|Zira|Karen|Moira|Tessa|Martha/iu;
  const preferredBoy = /Alex|Tom|Daniel|David|Guy|Arthur/iu;
  const wrongLocale = /Chinese|Mandarin|Cantonese|Ting[- ]?Ting|Mei[- ]?Jia|Sin[- ]?ji|普通话|中文|粤语|香港|台湾/iu;

  return (
    (/^en-US/iu.test(lang) ? 40 : 0) +
    (/^en/iu.test(lang) ? 25 : 0) +
    (preferredAny.test(name) ? 40 : 0) +
    (protagonistGender === "boy" && preferredBoy.test(name) ? 30 : 0) +
    (protagonistGender !== "boy" && preferredGirl.test(name) ? 30 : 0) +
    (/Google|Microsoft|Apple/iu.test(name) ? 8 : 0) +
    (voice.localService ? 3 : 0) +
    (voice.default ? 2 : 0) -
    (wrongLocale.test(name) ? 120 : 0)
  );
}

function pickProductVoice(voices: SpeechSynthesisVoice[], language: BookLanguage, protagonistGender: ProtagonistGender) {
  if (language === "en") {
    const englishVoices = voices.filter((voice) => /^en([_-]|$)/iu.test(voice.lang) || /\bEnglish\b/iu.test(voice.name));
    return englishVoices.sort((left, right) => scoreEnglishVoice(right, protagonistGender) - scoreEnglishVoice(left, protagonistGender))[0] || null;
  }

  const chineseVoices = voices.filter((voice) => /^zh/iu.test(voice.lang) || /Chinese|Mandarin|普通话|中文/iu.test(voice.name));
  const warmNames = /Xiaoxiao|Xiaoyi|Ting[- ]?Ting|Tingting|Mei[- ]?Jia|Meijia|Xiaochen|Xiaohan|晓晓|晓伊|婷婷|美佳/iu;
  const harshNames = /Yunxi|Yunjian|Yunyang|Yunhao|Yunxia|Yunfeng|Yu[- ]?shu|Eddy|Reed|Rocko|Shelley|Grandpa|男/iu;
  return (
    chineseVoices.find((voice) => warmNames.test(voice.name)) ||
    chineseVoices.find((voice) => !harshNames.test(voice.name) && voice.localService) ||
    chineseVoices[0] ||
    null
  );
}

function playAudio(audioUrl: string, runId: number) {
  return new Promise<void>((resolve, reject) => {
    if (runId !== speechRunId) {
      resolve();
      return;
    }

    const audio = new Audio(audioUrl);
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (resolveActiveAudio === finish) {
        resolveActiveAudio = null;
      }
      callback();
    };
    const finish = () => settle(resolve);

    activeAudio = audio;
    resolveActiveAudio = finish;
    audio.onended = () => {
      settle(resolve);
    };
    audio.onerror = () => {
      settle(() => reject(new Error("音频播放失败")));
    };
    void audio.play().catch((error) => settle(() => reject(error)));
  });
}

export function stopProductSpeech() {
  speechRunId += 1;
  const audio = activeAudio;
  const finishAudio = resolveActiveAudio;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    activeAudio = null;
  }
  window.speechSynthesis?.cancel();
  finishAudio?.();
  resolveActiveUtterance?.();
  resolveActiveUtterance = null;
}

export async function speakProductText(
  text: string,
  language: BookLanguage,
  protagonistGender: ProtagonistGender,
  audioUrl?: string
) {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    return;
  }

  stopProductSpeech();
  const runId = speechRunId;

  if (audioUrl) {
    await playAudio(audioUrl, runId);
    return;
  }

  try {
    const generatedAudioUrl = await synthesizePictureBookSpeech(cleanText, protagonistGender, language);
    await playAudio(generatedAudioUrl, runId);
    return;
  } catch {
    if (runId !== speechRunId) {
      return;
    }
  }

  if (!window.speechSynthesis || runId !== speechRunId) {
    return;
  }

  const voice = pickProductVoice(await getBrowserVoices(), language, protagonistGender);
  if (runId !== speechRunId) {
    return;
  }

  const chunks = splitSpeechText(cleanText);
  for (const chunk of chunks) {
    if (runId !== speechRunId) {
      break;
    }

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      const finishUtterance = () => {
        if (resolveActiveUtterance === finishUtterance) {
          resolveActiveUtterance = null;
        }
        resolve();
      };
      utterance.lang = voice?.lang || (language === "en" ? "en-US" : "zh-CN");
      utterance.voice = voice;
      utterance.rate = language === "en" ? 0.94 : 1.08;
      utterance.pitch = language === "en" && protagonistGender === "boy" ? 0.98 : 1.03;
      utterance.onend = () => window.setTimeout(finishUtterance, runId === speechRunId ? 80 : 0);
      utterance.onerror = finishUtterance;
      resolveActiveUtterance = finishUtterance;
      window.speechSynthesis.speak(utterance);
    });
  }
}
