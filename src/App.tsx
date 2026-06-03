import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  MicOff,
  Paintbrush,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Volume2
} from "lucide-react";
import companionRobot from "./assets/companion-robot.png";

type PromptRecord = {
  id: string;
  type: "story" | "image" | "culture" | "system";
  label: string;
  prompt: string;
  output: string;
  createdAt: string;
};

type PictureBookPage = {
  pageNumber: number;
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string;
  imageSource: "bailian" | "placeholder";
  cultureNote: string;
  speechAudioUrl?: string;
  speechAudioText?: string;
};

type PictureBook = {
  id: string;
  title: string;
  subtitle: string;
  originalIdea: string;
  language?: BookLanguage;
  protagonistGender?: ProtagonistGender;
  createdAt: string;
  updatedAt: string;
  heritageElements: string[];
  tourismElements: string[];
  guidingQuestions: string[];
  outline: string;
  pages: PictureBookPage[];
  tourGuideScript: string;
  studentReflection: string;
  aiContentRatio: number;
  promptRecords: PromptRecord[];
};

type PictureBookSummary = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  language?: BookLanguage;
  protagonistGender?: ProtagonistGender;
  heritageElements: string[];
  tourismElements: string[];
  coverImageUrl: string;
};

type BookLanguage = "zh" | "en";

type ProtagonistGender = "girl" | "boy";

type ImageTaskStatus = "idle" | "queued" | "running" | "done" | "error";

type ProgressStage = "understanding" | "story" | "prompts" | "images" | "archive";

type GenerationProgress = {
  active: boolean;
  startedAt: number;
  elapsedSeconds: number;
  stage: ProgressStage;
  title: string;
  detail: string;
  imageTasks: Record<number, ImageTaskStatus>;
  activityLog: string[];
  error?: string;
};

const stageLabels: Record<ProgressStage, string> = {
  understanding: "写下灵感",
  story: "整理故事",
  prompts: "绘制插图",
  images: "装订成册",
  archive: "放进书架"
};

const progressStages: ProgressStage[] = ["understanding", "story", "prompts", "images", "archive"];

const emptyImageTasks: Record<number, ImageTaskStatus> = {
  1: "idle",
  2: "idle",
  3: "idle",
  4: "idle"
};

const defaultInspirationChips = [
  "六一在北海银滩搭贝雕小舞台",
  "三江侗族大歌变成班级回声游戏",
  "南宁动物园的小熊猫画展",
  "德天瀑布边的天琴生日派对",
  "梧州六堡茶香里的儿童节邮局",
  "钦州坭兴陶小杯接住海浪"
];

const localInspirationFallbackPool = [
  ...defaultInspirationChips,
  "玉林真武阁楼梯变成云朵迷宫",
  "河池毛南花竹帽带来六一巡游",
  "崇左花山岩画小人跳出红色舞步",
  "贺州黄姚古镇里的皮影寻路任务",
  "防城港白浪滩上的独弦琴海风音乐会",
  "百色右江边的红领巾时光信箱",
  "龙脊梯田云朵里的农耕游戏",
  "柳州夜市里的文化味道线索",
  "桂林漓江竹筏收到山歌地图",
  "青秀山五色糯米饭野餐任务",
  "北海贝壳邮局寄出海风谜语",
  "钦州坭兴陶工坊里的雨天救援"
];

function rotateLocalInspirationChips(refreshCount: number) {
  const start = Math.abs(refreshCount * 5 + new Date().getMinutes()) % localInspirationFallbackPool.length;
  return localInspirationFallbackPool.slice(start).concat(localInspirationFallbackPool.slice(0, start)).slice(0, 6);
}

async function readApiJson<T>(response: Response, emptyMessage = "服务返回内容为空，请稍后再试。") {
  const text = await response.text().catch(() => "");
  const data = text
    ? (() => {
        try {
          return JSON.parse(text) as (T & { error?: string }) | null;
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new Error(data?.error || emptyMessage);
  }
  if (!data) {
    throw new Error(emptyMessage);
  }

  return data as T;
}

const englishDisplayTerms: Record<string, string> = {
  桂小雅: "Gui Xiaoya",
  "是广西文化元素，适合和相关地点、人物或行动自然连在一起。": " is a Guangxi local highlight. Use it when it naturally connects with the place, characters, or action.",
  "是广西文化元素": " is a Guangxi local highlight",
  壮族绣球: "Zhuang embroidered ball",
  壮族山歌: "Zhuang mountain songs",
  刘三姐歌谣: "Liu Sanjie ballads",
  壮族三月三: "Zhuang Sanyuesan Festival",
  五色糯米饭: "five-color sticky rice",
  北海贝雕: "Beihai shell carving",
  合浦南珠制作技艺: "Hepu pearl craft",
  疍家渔歌: "Tanka fishing songs",
  三娘湾中华白海豚生态观察: "Sanniang Bay Chinese white dolphin ecology",
  钦州海边赶海生活: "Qinzhou tide-pool gathering life",
  侗族大歌: "Dong grand song",
  侗族木构建筑营造技艺: "Dong wooden architecture",
  侗族刺绣: "Dong embroidery",
  瑶族盘王节: "Yao Panwang Festival",
  毛南族花竹帽编织技艺: "Maonan flower bamboo-hat weaving",
  天琴弹唱: "Tianqin singing",
  花山岩画: "Huashan rock paintings",
  柳州螺蛳粉制作技艺: "Liuzhou luosifen-making craft",
  广西彩调: "Guangxi Caidiao opera",
  融水苗族芦笙斗马节: "Rongshui Miao lusheng and horse-fighting festival",
  桂林米粉制作技艺: "Guilin rice noodle craft",
  龙脊梯田农耕文化: "Longji Terrace farming culture",
  瑶族服饰: "Yao clothing",
  百色芒果种植文化: "Baise mango-growing culture",
  右江壮族农耕生活: "Youjiang Zhuang farming life",
  钦州坭兴陶烧制技艺: "Qinzhou Nixing pottery firing craft",
  壮锦织造技艺: "Zhuang brocade weaving",
  铜鼓习俗: "bronze drum customs",
  桂林山水自然观察: "Guilin landscape nature observation",
  漓江山水与竹筏生活: "Li River scenery and bamboo-raft life",
  德天瀑布边境山水: "Detian Waterfall border landscape",
  明仕田园喀斯特风光: "Mingshi Countryside karst landscape",
  北海银滩海洋观察: "Beihai Silver Beach marine observation",
  合浦海丝港口故事: "Hepu Maritime Silk Road port stories",
  钦州三娘湾海洋观察: "Qinzhou Sanniang Bay marine observation",
  钦州茅尾海渔家生活: "Qinzhou Maowei Sea fishing-family life",
  三江风雨桥建筑观察: "Sanjiang Wind-Rain Bridge architecture",
  三江侗寨生活观察: "Sanjiang Dong village daily life",
  龙脊梯田农耕风景: "Longji Terrace farming landscape",
  河池山乡节庆观察: "Hechi mountain-village festival observation",
  南宁青秀山自然观察: "Nanning Qingxiu Mountain nature observation",
  南宁动物园动物观察: "Nanning Zoo animal observation",
  南宁老街城市记忆: "Nanning old-street city memories",
  黄姚古镇生活美学: "Huangyao Ancient Town everyday aesthetics",
  柳州柳江城市风景: "Liuzhou Liujiang city scenery",
  柳州窑埠夜市生活: "Liuzhou Yaobu night-market life",
  百色芒果园自然观察: "Baise mango-orchard nature observation",
  百色右江河谷田园生活: "Baise Youjiang River Valley rural life",
  崇左左江山水观察: "Chongzuo Zuojiang landscape observation",
  桂林山水: "Guilin karst landscape",
  阳朔漓江: "Yangshuo Li River",
  德天跨国瀑布: "Detian Transnational Waterfall",
  崇左明仕田园: "Chongzuo Mingshi Countryside",
  北海银滩: "Beihai Silver Beach",
  合浦海丝首港: "Hepu Maritime Silk Road First Port",
  钦州三娘湾: "Qinzhou Sanniang Bay",
  钦州茅尾海: "Qinzhou Maowei Sea",
  三江程阳风雨桥: "Sanjiang Chengyang Wind-Rain Bridge",
  三江鼓楼侗寨: "Sanjiang drum-tower Dong village",
  龙脊梯田: "Longji Terraces",
  河池东兰铜鼓文化景区: "Hechi Donglan Bronze Drum Cultural Area",
  南宁青秀山: "Nanning Qingxiu Mountain",
  南宁动物园: "Nanning Zoo",
  南宁三街两巷: "Nanning Three Streets and Two Alleys",
  黄姚古镇: "Huangyao Ancient Town",
  柳州百里柳江: "Liuzhou Baili Liujiang scenic belt",
  柳州窑埠古镇: "Liuzhou Yaobu Ancient Town",
  百色芒果园: "Baise mango orchards",
  百色右江河谷: "Baise Youjiang River Valley",
  崇左花山岩画景区: "Chongzuo Huashan Rock Painting Scenic Area",
  小熊猫: "red panda",
  壮语童谣: "Zhuang nursery rhyme"
};

function localizeEnglishDisplayText(text: string, language: BookLanguage = "zh") {
  if (language !== "en" || !text) {
    return text;
  }

  return Object.entries(englishDisplayTerms)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((current, [source, target]) => current.split(source).join(target), text);
}

function getBookDetailHref(bookId: string) {
  return `#/book/${encodeURIComponent(bookId)}`;
}

function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
  });
}

function pickWarmVoice(voices: SpeechSynthesisVoice[], language: BookLanguage) {
  if (language === "en") {
    const englishVoices = voices.filter((voice) => /^en/i.test(voice.lang) || /English/u.test(voice.name));
    return (
      englishVoices.find((voice) => /Samantha|Ava|Jenny|Aria|Google US English|English/u.test(voice.name)) ||
      englishVoices.find((voice) => voice.localService) ||
      englishVoices[0] ||
      null
    );
  }

  const chineseVoices = voices.filter((voice) => /^zh/i.test(voice.lang) || /Chinese|Mandarin|普通话|中文/u.test(voice.name));
  const warmFemaleNames = /Xiaoxiao|Xiaoyi|Ting[- ]?Ting|Tingting|Mei[- ]?Jia|Meijia|Sin[- ]?ji|Xiaochen|Xiaohan|晓晓|晓伊|婷婷|美佳/iu;
  const harshOrMaleNames = /Yunxi|Yunjian|Yunyang|Yunhao|Yunxia|Yunfeng|Yu[- ]?shu|Eddy|Reed|Rocko|Shelley|Grandpa|男/iu;
  const preferredChineseVoices = chineseVoices
    .filter((voice) => !harshOrMaleNames.test(voice.name))
    .sort((left, right) => {
      const leftScore =
        (warmFemaleNames.test(left.name) ? 100 : 0) +
        (/zh-CN|cmn-Hans-CN/iu.test(left.lang) ? 20 : 0) +
        (/Google|Microsoft|Apple/iu.test(left.name) ? 8 : 0) +
        (left.localService ? 4 : 0);
      const rightScore =
        (warmFemaleNames.test(right.name) ? 100 : 0) +
        (/zh-CN|cmn-Hans-CN/iu.test(right.lang) ? 20 : 0) +
        (/Google|Microsoft|Apple/iu.test(right.name) ? 8 : 0) +
        (right.localService ? 4 : 0);
      return rightScore - leftScore;
    });
  return (
    preferredChineseVoices[0] ||
    chineseVoices.find((voice) => warmFemaleNames.test(voice.name)) ||
    chineseVoices.find((voice) => !harshOrMaleNames.test(voice.name) && voice.localService) ||
    chineseVoices[0] ||
    null
  );
}

function splitSpeechText(text: string) {
  return text
    .replace(/\s+/gu, " ")
    .split(/(?<=[。！？!?])|(?<=\.)\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

let browserSpeechRunId = 0;
let resolveCurrentSpeech: (() => void) | null = null;
let currentSpeechAudio: HTMLAudioElement | null = null;
let serverSpeechRetryAt = 0;

function stopBrowserSpeech() {
  browserSpeechRunId += 1;
  resolveCurrentSpeech?.();
  resolveCurrentSpeech = null;
  if (currentSpeechAudio) {
    currentSpeechAudio.pause();
    currentSpeechAudio.removeAttribute("src");
    currentSpeechAudio.load();
    currentSpeechAudio = null;
  }
  window.speechSynthesis?.cancel();
}

async function playSpeechAudio(audioUrl: string, shouldKeepSpeaking: () => boolean) {
  if (!shouldKeepSpeaking()) {
    return true;
  }

  const audio = new Audio(audioUrl);
  currentSpeechAudio = audio;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (resolveCurrentSpeech === finish) {
        resolveCurrentSpeech = null;
      }
      if (currentSpeechAudio === audio) {
        currentSpeechAudio = null;
      }
      resolve();
    };
    const fail = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (resolveCurrentSpeech === finish) {
        resolveCurrentSpeech = null;
      }
      if (currentSpeechAudio === audio) {
        currentSpeechAudio = null;
      }
      reject(new Error("Audio playback failed"));
    };
    resolveCurrentSpeech = finish;
    audio.onended = finish;
    audio.onerror = fail;
    void audio.play().catch(fail);
  });
  return true;
}

async function speakWithServerVoice(
  text: string,
  shouldKeepSpeaking: () => boolean,
  protagonistGender: ProtagonistGender = "girl",
  audioUrl?: string
) {
  if (audioUrl) {
    try {
      return await playSpeechAudio(audioUrl, shouldKeepSpeaking);
    } catch {
      if (!shouldKeepSpeaking()) {
        return true;
      }
    }
  }

  if (Date.now() < serverSpeechRetryAt) {
    throw new Error("Server TTS is cooling down");
  }
  if (!shouldKeepSpeaking()) {
    return true;
  }

  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, protagonistGender })
  });
  const data = await readApiJson<{ audioUrl?: string; error?: string }>(response, "朗读音频生成失败");
  if (!response.ok || !data.audioUrl) {
    throw new Error(data.error || "TTS failed");
  }
  if (!shouldKeepSpeaking()) {
    return true;
  }

  return playSpeechAudio(data.audioUrl, shouldKeepSpeaking);
}

async function speakWithBrowser(
  text: string,
  language: BookLanguage = "zh",
  options?: { audioUrl?: string; shouldContinue?: () => boolean; protagonistGender?: ProtagonistGender }
) {
  stopBrowserSpeech();
  const runId = browserSpeechRunId;
  const shouldKeepSpeaking = () => runId === browserSpeechRunId && (options?.shouldContinue?.() ?? true);
  if (language === "zh") {
    try {
      await speakWithServerVoice(text, shouldKeepSpeaking, options?.protagonistGender || "girl", options?.audioUrl);
      return;
    } catch {
      serverSpeechRetryAt = Date.now() + 10 * 60 * 1000;
      if (!shouldKeepSpeaking()) {
        return;
      }
    }
  }

  if (!window.speechSynthesis) {
    return;
  }

  const voice = pickWarmVoice(await getBrowserVoices(), language);
  if (!shouldKeepSpeaking()) {
    return;
  }
  const chunks = splitSpeechText(text);
  for (const [index, chunk] of chunks.entries()) {
    if (!shouldKeepSpeaking()) {
      break;
    }
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang || (language === "en" ? "en-US" : "zh-CN");
    utterance.voice = voice;
    utterance.rate = 1.12;
    utterance.pitch = 1.03;
    window.speechSynthesis.speak(utterance);
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (resolveCurrentSpeech === finish) {
          resolveCurrentSpeech = null;
        }
        resolve();
      };
      resolveCurrentSpeech = finish;
      utterance.onend = () => window.setTimeout(finish, shouldKeepSpeaking() && index < chunks.length - 1 ? 80 : 0);
      utterance.onerror = finish;
    });
    if (!shouldKeepSpeaking()) {
      break;
    }
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function softenDisplayText(text = "") {
  return text
    .replace(/桂小灵/gu, "桂小雅")
    .replace(/Gui Xiaoling/giu, "Gui Xiaoya")
    .replace(/\b(undefined|null|nan)\b/giu, "")
    .replace(/未定义/gu, "")
    .replace(/和\s*([。！？!?；;，,])/gu, "$1")
    .replace(/与\s*([。！？!?；;，,])/gu, "$1")
    .replace(/桂韵创想家 核心提示词/gu, "核心创建故事提示词")
    .replace(/百炼故事生成 Prompt/gu, "核心创建故事提示词")
    .replace(/Guiyun Creator Core Prompt/giu, "Core Story Creation Prompt")
    .replace(/Prompt\s*记录/giu, "创作记录")
    .replace(/图片\s*Prompt/giu, "插图灵感")
    .replace(/故事生成\s*Prompt/giu, "故事灵感整理")
    .replace(/\bPrompt\b/giu, "灵感说明")
    .replace(/AI\s*生成内容约\s*\d+%/giu, "故事内容已整理")
    .replace(/AI\s*生成/giu, "桂小雅整理")
    .replace(/AI\s*追问/giu, "灵感小问题")
    .replace(/AI\s*小助手|AI\s*助手/giu, "桂小雅")
    .replace(/\bAI\b/giu, "桂小雅")
    .replace(/并行/gu, "一起")
    .replace(/生成率/gu, "完成度")
    .replace(/生成图片/gu, "绘制插图")
    .replace(/重新生成/gu, "重新画一版")
    .replace(/生成插图/gu, "绘制插图")
    .replace(/生成绘本/gu, "制作绘本")
    .replace(/模型/gu, "画笔")
    .replace(/任务/gu, "小步骤")
    .replace(/工作流/gu, "创作路线")
    .replace(/调试|Debug/giu, "查看")
    .replace(/\bStep\b/giu, "步骤");
}

function displayBookText(text = "", language: BookLanguage = "zh") {
  return localizeEnglishDisplayText(softenDisplayText(text), language);
}

function softenRecordText(text = "") {
  return softenDisplayText(text)
    .replace(/百炼/gu, "桂小雅")
    .replace(/OpenAI/giu, "创作伙伴")
    .replace(/DashScope/giu, "创作伙伴")
    .replace(/system/giu, "创作设定")
    .replace(/user/giu, "我的灵感");
}

function displayRecordText(text = "", language: BookLanguage = "zh") {
  return language === "en" ? localizeEnglishDisplayText(text, language) : softenRecordText(text);
}

function getRecordTypeLabel(type: PromptRecord["type"]) {
  const labels: Record<PromptRecord["type"], string> = {
    story: "故事整理",
    image: "插图灵感",
    culture: "文化小知识",
    system: "书桌记录"
  };
  return labels[type];
}

function cleanSpeechPart(text: string) {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。！？!?.,，、；;：:]+$/gu, "");
}

function buildReadText(book: PictureBook) {
  const language = book.language || "zh";
  const parts = [book.title, ...book.pages.map((page) => page.text), book.tourGuideScript]
    .map((part) => displayBookText(part, language))
    .map(cleanSpeechPart)
    .filter(Boolean);
  if (!parts.length) {
    return "";
  }

  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

function buildPageReadText(book: PictureBook, page: PictureBookPage, includeCultureNote = false) {
  const language = book.language || "zh";
  const parts = [page.title, page.text, includeCultureNote ? page.cultureNote : ""]
    .map((part) => displayBookText(part, language))
    .map(cleanSpeechPart)
    .filter(Boolean);
  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

function mergePictureBook(current: PictureBook | null, incoming: PictureBook) {
  if (!current || current.id !== incoming.id) {
    return incoming;
  }

  const currentPages = new Map(current.pages.map((page) => [page.pageNumber, page]));
  const mergedRecords = new Map<string, PromptRecord>();
  [...current.promptRecords, ...incoming.promptRecords].forEach((record) => mergedRecords.set(record.id, record));

  return {
    ...incoming,
    pages: incoming.pages.map((page) => {
      const currentPage = currentPages.get(page.pageNumber);
      return {
        ...page,
        imageUrl: page.imageUrl || currentPage?.imageUrl || "",
        imageSource: page.imageUrl ? page.imageSource : currentPage?.imageSource || page.imageSource,
        speechAudioText: page.speechAudioText || currentPage?.speechAudioText,
        speechAudioUrl: page.speechAudioUrl || currentPage?.speechAudioUrl
      };
    }),
    promptRecords: [...mergedRecords.values()]
  };
}

function trimLogText(text = "", maxLength = 84) {
  const compact = displayBookText(text).replace(/\s+/gu, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

function appendActivityLog(progress: GenerationProgress, lines: string[]) {
  const nextLines = [...progress.activityLog];
  lines.map((line) => line.trim()).filter(Boolean).forEach((line) => {
    if (!nextLines.includes(line)) {
      nextLines.push(line);
    }
  });

  return {
    ...progress,
    activityLog: nextLines.slice(-18)
  };
}

function makeGenerationLog(idea: string, language: BookLanguage) {
  if (language === "en") {
    return [
      `Received idea: ${trimLogText(idea, 72)}`,
      "Identifying the main place, protagonist, and Guangxi cultural clues."
    ];
  }

  return [
    `收到灵感：${trimLogText(idea, 72)}`,
    "正在识别地点、主角、广西文化线索和故事动作。"
  ];
}

function makeBookActivityLog(book: PictureBook) {
  const language = book.language || "zh";
  if (language === "en") {
    return [
      `Title drafted: ${trimLogText(book.title, 72)}`,
      `Story route: ${trimLogText(book.outline, 94)}`,
      ...book.pages.flatMap((page) => [
        `Page ${page.pageNumber}: ${trimLogText(page.title, 58)}`,
        `Mini encyclopedia: ${trimLogText(page.cultureNote, 92)}`
      ])
    ];
  }

  return [
    `标题成形：${trimLogText(book.title, 72)}`,
    `故事路线：${trimLogText(book.outline, 94)}`,
    ...book.pages.flatMap((page) => [
      `第 ${page.pageNumber} 页：${trimLogText(page.title, 58)}`,
      `小百科：${trimLogText(page.cultureNote, 92)}`
    ])
  ];
}

const stageActivityLines: Record<ProgressStage, string[]> = {
  understanding: [
    "正在把灵感拆成地点、角色、动作和文化线索。",
    "正在判断哪些广西元素真正适合这个故事。",
    "正在避免把无关的热门符号硬塞进故事。"
  ],
  story: [
    "正在组织 4 页起承转合，让故事适合朗读。",
    "正在为每一页选择一个可以画出来的关键瞬间。",
    "正在把文化说明改写成儿童能听懂的小百科。"
  ],
  prompts: [
    "正在把故事页整理成插图提示。",
    "正在锁定主角外观、桂小雅造型和统一画风。",
    "正在清理插图提示里的文字内容，避免文字被画进图片。"
  ],
  images: [
    "插图任务已经开始，正在等待每一页返回。",
    "正在把完成的插图放回对应故事页。",
    "正在检查插图任务状态，失败的页面可以稍后重画。"
  ],
  archive: [
    "正在保存绘本、创作记录和小百科。",
    "正在刷新我的绘本书架。",
    "绘本完成后可以打开剧场朗读。"
  ]
};

function appendNextStageActivity(progress: GenerationProgress) {
  const candidates = stageActivityLines[progress.stage] || [];
  const nextLine = candidates.find((line) => !progress.activityLog.includes(line));
  return nextLine ? appendActivityLog(progress, [nextLine]) : progress;
}

function makeProgress(
  stage: ProgressStage,
  title: string,
  detail: string,
  imageTasks = emptyImageTasks,
  activityLog: string[] = []
): GenerationProgress {
  return {
    active: true,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    stage,
    title,
    detail,
    imageTasks: { ...imageTasks },
    activityLog
  };
}

export default function App({ embeddedInProduct = false }: { embeddedInProduct?: boolean } = {}) {
  const [idea, setIdea] = useState("我想写一个小朋友在三月三歌圩上遇到会唱山歌的绣球。");
  const [books, setBooks] = useState<PictureBookSummary[]>([]);
  const [activeBook, setActiveBook] = useState<PictureBook | null>(null);
  const [notice, setNotice] = useState("写下一句灵感，桂小雅陪你做一本广西文化绘本");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [shouldGenerateImage, setShouldGenerateImage] = useState(true);
  const [bookLanguage, setBookLanguage] = useState<BookLanguage>("zh");
  const [protagonistGender, setProtagonistGender] = useState<ProtagonistGender>("girl");
  const [activeTab, setActiveTab] = useState<"book" | "prompts">("book");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [inspirationChips, setInspirationChips] = useState(defaultInspirationChips);
  const [inspirationContext, setInspirationContext] = useState("六一童趣");
  const [isDiscoveringInspirations, setIsDiscoveringInspirations] = useState(false);
  const [inspirationRefreshCount, setInspirationRefreshCount] = useState(0);
  const hasLoadedAiInspirationsRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (embeddedInProduct) {
      return;
    }
    document.title = "桂小雅绘本工坊 - 肖予曦开发";
  }, [embeddedInProduct]);

  useEffect(() => {
    void refreshBooks();
  }, []);

  useEffect(() => {
    if (hasLoadedAiInspirationsRef.current) {
      return;
    }
    hasLoadedAiInspirationsRef.current = true;
    void discoverMoreInspirations({ silent: true, useCurrentIdea: false });
  }, []);

  useEffect(() => {
    if (!generationProgress?.active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (!current?.active) {
          return current;
        }
        return {
          ...current,
          elapsedSeconds: Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000))
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generationProgress?.active]);

  useEffect(() => {
    if (!generationProgress?.active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (!current?.active) {
          return current;
        }
        return appendNextStageActivity(current);
      });
    }, 2600);

    return () => window.clearInterval(timer);
  }, [generationProgress?.active, generationProgress?.stage]);

  useEffect(() => {
    workbenchBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (activeBook) {
      workbenchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [activeBook?.id, activeTab]);

  async function refreshBooks() {
    const response = await fetch("/api/picture-books");
    const data = await readApiJson<{ books?: PictureBookSummary[] }>(response, "书架刷新失败");
    setBooks(data.books || []);
    return data.books || [];
  }

  async function loadBook(id: string, options?: { silent?: boolean }) {
    const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`);
    const data = await readApiJson<{ book?: PictureBook; error?: string }>(response, "作品打开失败");
    if (!response.ok || !data.book) {
      throw new Error(data.error || "作品不存在");
    }
    setActiveBook(data.book);
    if ((data.book.language || "zh") === "zh" && data.book.pages.some((page) => !page.speechAudioUrl)) {
      void preloadSpeechForBook(data.book.id);
    }
    if (!options?.silent) {
      setNotice("已打开绘本，可以继续换插图或查看创作记录");
    }
    return data.book;
  }

  async function preloadSpeechForBook(bookId: string) {
    try {
      const response = await fetch(`/api/picture-books/${encodeURIComponent(bookId)}/speech/preload`, { method: "POST" });
      const data = await readApiJson<{ book?: PictureBook; books?: PictureBookSummary[] }>(response, "朗读预加载失败");
      if (!response.ok || !data.book) {
        return null;
      }
      setActiveBook((current) => mergePictureBook(current, data.book!));
      if (data.books) {
        setBooks(data.books);
      }
      return data.book;
    } catch {
      return null;
    }
  }

  async function openBook(id: string) {
    await loadBook(id);
    setActiveTab("book");
    setGenerationProgress(null);
  }

  async function generateBook(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanIdea = idea.trim();
    if (!cleanIdea || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setActiveTab("book");
    setActiveBook(null);
    setGenerationProgress(
      makeProgress(
        "understanding",
        "正在把灵感写进故事本",
        "桂小雅正在找主角、广西文化亮点和旅行地点。",
        emptyImageTasks,
        makeGenerationLog(cleanIdea, bookLanguage)
      )
    );
    setNotice("桂小雅正在读你的灵感，马上开始整理故事");
    try {
      setGenerationProgress((current) =>
        current
          ? appendActivityLog(
              {
                ...current,
                stage: "story",
                title: "正在整理故事",
                detail: "桂小雅正在整理标题、4 页故事、文化小百科和小学生讲解词。"
              },
              ["开始整理标题、4 页故事、文化小百科和小学生讲解词。"]
            )
          : current
      );
      const response = await fetch("/api/picture-books/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: cleanIdea, language: bookLanguage, protagonistGender, generateImage: false })
      });
      const data = await readApiJson<{ book?: PictureBook; books?: PictureBookSummary[]; error?: string }>(response, "绘本制作失败");
      if (!response.ok || !data.book) {
        throw new Error(data.error || "绘本制作失败");
      }
      setActiveBook(data.book);
      setBooks(data.books || []);
      const draftLog = makeBookActivityLog(data.book);
      const speechPreload =
        bookLanguage === "zh" ? preloadSpeechForBook(data.book.id) : Promise.resolve<PictureBook | null>(null);
      setGenerationProgress((current) =>
        current
          ? appendActivityLog(
              {
                ...current,
                stage: shouldGenerateImage ? "prompts" : "archive",
                title: shouldGenerateImage ? "正在为绘本分镜" : "正在放进我的书架",
                detail: shouldGenerateImage
                  ? "故事路线已经出现，正在整理 4 页画面和角色样子。"
                  : "故事、创作记录和绘本档案正在放进书架。"
              },
              draftLog.concat(shouldGenerateImage ? ["故事草稿完成，准备整理插图提示。"] : ["故事草稿完成，准备放进书架。"])
            )
          : current
      );

      if (shouldGenerateImage) {
        const runningTasks = data.book.pages.reduce<Record<number, ImageTaskStatus>>(
          (tasks, page) => ({ ...tasks, [page.pageNumber]: "running" }),
          { ...emptyImageTasks }
        );
        setGenerationProgress((current) =>
          current
            ? appendActivityLog(
                {
                  ...current,
                  stage: "images",
                  title: "正在为故事页绘制插图",
                  detail: "桂小雅会把 4 个故事页一页页画好，完成后自动放回绘本。",
                  imageTasks: runningTasks
                },
                ["4 页插图任务已排队，正在同时绘制。"]
              )
            : current
        );
        setNotice("故事已经整理好，桂小雅正在绘制插图");

        const results = await Promise.allSettled(
          data.book.pages.map((page) => generateImageForBook(data.book!.id, page.pageNumber, "batch"))
        );
        await speechPreload;
        const failedCount = results.filter((result) => result.status === "rejected").length;

        setGenerationProgress((current) =>
          current
            ? appendActivityLog(
                {
                  ...current,
                  active: false,
                  stage: "archive",
                  title: failedCount ? "故事书已装订完成，部分插图可再画" : "故事书已装订完成",
                  detail: failedCount
                    ? `有 ${failedCount} 页插图还没画好，故事已先放进绘本。`
                    : "4 页故事、插图和文化小百科都已经放进绘本里了。",
                  error: failedCount ? "部分插图还没画好" : undefined
                },
                [failedCount ? `绘本已保存，有 ${failedCount} 页插图可以稍后重画。` : "绘本已保存到书架，可以打开剧场朗读。"]
              )
            : current
        );
        await refreshBooks();
        setNotice(failedCount ? "绘本已经准备好啦：有几页插图可以再画一版" : "绘本已经准备好啦：可以朗读、看插图，也可以查看创作记录");
      } else {
        void speechPreload;
        setGenerationProgress((current) =>
          current
            ? appendActivityLog(
                {
                  ...current,
                  active: false,
                  stage: "archive",
                  title: "故事书已装订完成",
                  detail: "已保存故事、文化小百科和创作记录；需要插图时可以单页补画。"
                },
                ["绘本已保存到书架，可以继续补画插图。"]
              )
            : current
        );
        setNotice("故事书已装订完成：可以单页补画插图或查看创作记录");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本制作失败";
      setGenerationProgress((current) =>
        current
          ? appendActivityLog(
              {
                ...current,
                active: false,
                title: "创作路上遇到一点问题",
                detail: message,
                error: message
              },
              [`遇到问题：${message}`]
            )
          : current
      );
      setNotice(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateImageForBook(bookId: string, pageNumber: number, mode: "batch" | "single") {
    setGenerationProgress((current) =>
      current
        ? appendActivityLog(
            {
              ...current,
              stage: "images",
              title: mode === "batch" ? "正在为故事页绘制插图" : `桂小雅正在画第 ${pageNumber} 页`,
              detail: `第 ${pageNumber} 页插图马上就好啦。`,
              imageTasks: { ...current.imageTasks, [pageNumber]: "running" }
            },
            [`第 ${pageNumber} 页：开始绘制插图。`]
          )
        : current
    );

    const response = await fetch(`/api/picture-books/${bookId}/pages/${pageNumber}/image`, { method: "POST" });
    const data = await readApiJson<{ book?: PictureBook; error?: string }>(response, "插图暂时没画好");
    if (!response.ok || !data.book) {
      setGenerationProgress((current) =>
        current
          ? appendActivityLog(
              {
                ...current,
                imageTasks: { ...current.imageTasks, [pageNumber]: "error" }
              },
              [`第 ${pageNumber} 页：插图暂时失败，可以稍后重画。`]
            )
          : current
      );
      throw new Error(data.error || "插图暂时没画好");
    }

    setActiveBook((current) => mergePictureBook(current, data.book!));
    setGenerationProgress((current) =>
      current
        ? appendActivityLog(
            {
              ...current,
              detail: `第 ${pageNumber} 页插图已经放进绘本，桂小雅继续整理其他页面。`,
              imageTasks: { ...current.imageTasks, [pageNumber]: "done" }
            },
            [`第 ${pageNumber} 页：插图已保存到绘本。`]
          )
        : current
    );
    return data.book;
  }

  async function deleteBook(id: string) {
    const deletePassword = window.prompt("请输入删除密码");
    if (deletePassword === null) {
      return;
    }
    const password = deletePassword.trim();
    if (!password) {
      setNotice("请输入删除密码后再删除绘本");
      return;
    }

    try {
      const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletePassword: password })
      });
      const data = await readApiJson<{ books?: PictureBookSummary[] }>(response, "绘本删除失败");
      setBooks(data.books || []);
      if (activeBook?.id === id) {
        setActiveBook(null);
      }
      setGenerationProgress(null);
      setNotice("绘本已从书架移走");
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本删除失败";
      setNotice(`删除失败：${message}`);
    }
  }

  function pickInspiration(chip: string) {
    setIdea(chip);
    setNotice("灵感已经放到书桌上，可以继续改写或开始做绘本");
  }

  async function discoverMoreInspirations(options?: { silent?: boolean; useCurrentIdea?: boolean }) {
    if (isDiscoveringInspirations || isGenerating) {
      return;
    }

    setIsDiscoveringInspirations(true);
    const nextRefreshCount = inspirationRefreshCount + 1;
    if (!options?.silent) {
      setNotice("桂小雅正在向模型寻找新的广西城市、景点和故事事件。");
    }
    try {
      const randomSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const response = await fetch("/api/inspiration-chips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDate: new Date().toISOString(),
          currentIdea: options?.useCurrentIdea === false ? "" : idea.trim(),
          existingChips: inspirationChips,
          randomSeed,
          refreshCount: nextRefreshCount,
          language: bookLanguage
        })
      });
      const data = await readApiJson<{ chips?: string[]; contextLabel?: string; error?: string }>(response, "灵感锦囊生成失败");
      if (!response.ok || !data.chips?.length) {
        throw new Error(data.error || "灵感锦囊生成失败");
      }

      const nextChips = data.chips.map(softenDisplayText).filter(Boolean).slice(0, 6);
      setInspirationChips(nextChips);
      setInspirationRefreshCount(nextRefreshCount);
      setInspirationContext(data.contextLabel || "六一童趣");
      if (!options?.silent) {
        setNotice(`已刷新${data.contextLabel || "六一童趣"}锦囊，里面也有自然贴合的非遗灵感`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "灵感锦囊生成失败";
      setInspirationChips(rotateLocalInspirationChips(nextRefreshCount));
      setInspirationContext("六一童趣");
      setInspirationRefreshCount(nextRefreshCount);
      if (!options?.silent) {
        setNotice(`${message}，先用本地灵感锦囊`);
      }
    } finally {
      setIsDiscoveringInspirations(false);
    }
  }

  function startListening() {
    if (!speechSupported || isGenerating) {
      setNotice("当前浏览器暂不支持语音输入，可以直接打字做绘本");
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      setIdea((finalText || interim).trim());
    };
    recognition.onerror = (event) => {
      setNotice(`语音识别遇到问题：${event.error}`);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setNotice("我在听，请说出你的广西文化旅行故事灵感");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setNotice("已收好声音灵感，可以开始做绘本");
  }

  const readText = activeBook ? buildReadText(activeBook) : "";

  return (
    <main className={`app-shell ${embeddedInProduct ? "is-product-embedded" : ""}`}>
      <section className="studio-layout">
        <aside className="left-panel">
          <div className="mascot-stage">
            <img src={companionRobot} alt="桂小雅" />
            <div className="mascot-badge">
              <Bot size={16} />
              <span>{isGenerating ? "桂小雅正在整理故事页" : "桂小雅陪你做绘本"}</span>
            </div>
          </div>

          <form className="idea-box" onSubmit={generateBook}>
            <label htmlFor="idea">今天的故事灵感</label>
            <textarea
              id="idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              disabled={isGenerating}
              placeholder="写下你想去的地方、想了解的文化亮点，或一个小小的故事开头……"
            />
            <div className="language-switch" aria-label="绘本语言">
              <span>绘本语言</span>
              <div>
                <button
                  type="button"
                  className={bookLanguage === "zh" ? "active" : ""}
                  onClick={() => setBookLanguage("zh")}
                  disabled={isGenerating}
                >
                  中文
                </button>
                <button
                  type="button"
                  className={bookLanguage === "en" ? "active" : ""}
                  onClick={() => setBookLanguage("en")}
                  disabled={isGenerating}
                >
                  English
                </button>
              </div>
            </div>
            <div className="language-switch" aria-label="主角角色">
              <span>主角小朋友</span>
              <div>
                <button
                  type="button"
                  className={protagonistGender === "girl" ? "active" : ""}
                  onClick={() => setProtagonistGender("girl")}
                  disabled={isGenerating}
                >
                  女孩
                </button>
                <button
                  type="button"
                  className={protagonistGender === "boy" ? "active" : ""}
                  onClick={() => setProtagonistGender("boy")}
                  disabled={isGenerating}
                >
                  男孩
                </button>
              </div>
            </div>
            <div className="composer-actions">
              <button
                className={`round-button ${isListening ? "active" : ""}`}
                type="button"
                onClick={isListening ? stopListening : startListening}
                aria-label={isListening ? "停止语音输入" : "开始语音输入"}
              >
                {isListening ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={shouldGenerateImage}
                  onChange={(event) => setShouldGenerateImage(event.target.checked)}
                />
                一起画好 4 页插图
              </label>
              <button className="primary-button" type="submit" disabled={!idea.trim() || isGenerating}>
                {isGenerating ? <LoaderCircle size={18} /> : <Send size={18} />}
                {isGenerating ? "正在做绘本" : "开始做绘本"}
              </button>
            </div>
          </form>

          <div className="inspiration-list">
            <div className="inspiration-head">
              <div>
                <p className="eyebrow">灵感锦囊</p>
                <span>{inspirationContext}</span>
              </div>
              <button className="discover-button" type="button" onClick={() => void discoverMoreInspirations()} disabled={isGenerating || isDiscoveringInspirations}>
                {isDiscoveringInspirations ? <LoaderCircle size={15} /> : <Sparkles size={15} />}
                {isDiscoveringInspirations ? "构思中" : "发现更多"}
              </button>
            </div>
            <div className="inspiration-chip-row">
              {inspirationChips.map((chip) => (
                <button type="button" key={chip} onClick={() => pickInspiration(chip)} disabled={isGenerating}>
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="archive">
            <div className="section-heading">
              <div>
                <p className="eyebrow">我的绘本书架</p>
                <h2>我的绘本书架</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setActiveBook(null);
                  setGenerationProgress(null);
                }}
                aria-label="新建作品"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="book-list">
              {books.length ? (
                books.map((book) => (
                  <article className={`book-list-item ${activeBook?.id === book.id ? "active" : ""}`} key={book.id}>
                    <button type="button" className="book-open" onClick={() => void openBook(book.id)}>
                      <BookOpen size={16} />
                      <span>
                        <strong>{displayBookText(book.title, book.language || "zh")}</strong>
                        <small>{formatDate(book.updatedAt)}</small>
                        <em>{book.heritageElements.concat(book.tourismElements).slice(0, 4).map((item) => displayBookText(item, book.language || "zh")).join(" · ")}</em>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => void deleteBook(book.id)}
                      aria-label={`删除作品：${book.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-state">还没有绘本。做完第一本后会自动放进书架。</p>
              )}
            </div>
          </div>
        </aside>

        <section className="workbench" ref={workbenchRef}>
          <header className="topbar">
            <div>
              <p className="eyebrow">桂小雅绘本工坊</p>
              <h2>{activeBook ? displayBookText(activeBook.title, activeBook.language || "zh") : "桂小雅的绘本工坊"}</h2>
            </div>
            <div className="topbar-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void speakWithBrowser(readText, activeBook?.language || "zh", { protagonistGender: activeBook?.protagonistGender || "girl" })
                }
                disabled={!activeBook}
              >
                <Volume2 size={18} />
                {activeBook?.language === "en" ? "Read Book" : "朗读绘本"}
              </button>
              {activeBook ? (
                <a className="primary-button" href={getBookDetailHref(activeBook.id)}>
                  <ExternalLink size={18} />
                  {activeBook.language === "en" ? "Read Picture Book" : "开始读绘本"}
                </a>
              ) : null}
              <button className="secondary-button" type="button" onClick={() => setActiveTab(activeTab === "book" ? "prompts" : "book")} disabled={!activeBook}>
                <FileText size={18} />
                {activeBook?.language === "en"
                  ? activeTab === "book"
                    ? "Creation Record"
                    : "Back to Book"
                  : activeTab === "book"
                    ? "创作记录"
                    : "返回绘本"}
              </button>
            </div>
          </header>

          <div className="notice-line">
            <Sparkles size={16} />
            <span>{notice}</span>
          </div>

          <div className="workbench-body" ref={workbenchBodyRef}>
            {generationProgress ? <GenerationProgressPanel progress={generationProgress} /> : null}
            {generationProgress && activeBook && !generationProgress.active ? (
              <PostGenerateActions book={activeBook} onDismiss={() => setGenerationProgress(null)} />
            ) : null}
            {activeBook ? (
              activeTab === "book" ? (
                <BookView
                  book={activeBook}
                  onGenerateImage={(pageNumber) => generateImageForBook(activeBook.id, pageNumber, "single")}
                  imageTasks={generationProgress?.imageTasks}
                />
              ) : (
                <PromptView records={activeBook.promptRecords} language={activeBook.language || "zh"} />
              )
            ) : generationProgress ? null : (
              <section className="empty-workbench">
                <Paintbrush size={42} />
                <h2>从一句灵感开始</h2>
                <p>输入或说出一个广西文化旅行故事，桂小雅会帮你整理成 4 页绘本、插图和小小讲解词。</p>
              </section>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function getProgressPercent(progress: GenerationProgress) {
  if (!progress.active && !progress.error) {
    return 100;
  }
  if (progress.error) {
    return 100;
  }

  const stageIndex = progressStages.indexOf(progress.stage);
  const base = [10, 26, 44, 58, 92][stageIndex] || 10;
  if (progress.stage !== "images") {
    return base;
  }

  const tasks = Object.values(progress.imageTasks).filter((status) => status !== "idle");
  const completedCount = tasks.filter((status) => status === "done" || status === "error").length;
  const totalCount = Math.max(tasks.length, 4);
  return Math.min(92, 58 + Math.round((completedCount / totalCount) * 34));
}

function getStepState(stage: ProgressStage, progress: GenerationProgress) {
  const stepIndex = progressStages.indexOf(stage);
  const currentIndex = progressStages.indexOf(progress.stage);
  if (progress.error && stage === progress.stage) {
    return "error";
  }
  if (!progress.active && !progress.error) {
    return "done";
  }
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "active";
  }
  return "pending";
}

function getStepIcon(state: string) {
  if (state === "done") {
    return <CheckCircle2 size={16} />;
  }
  if (state === "error") {
    return <AlertCircle size={16} />;
  }
  if (state === "active") {
    return <LoaderCircle size={16} />;
  }
  return <span className="pending-dot" />;
}

function getImageTaskLabel(status: ImageTaskStatus) {
  if (status === "running") {
    return "绘制中";
  }
  if (status === "done") {
    return "已放入绘本";
  }
  if (status === "error") {
    return "可再画";
  }
  if (status === "queued") {
    return "等画纸";
  }
  return "待开始";
}

function getImageSourceLabel(page: PictureBookPage, taskStatus: ImageTaskStatus, language: BookLanguage = "zh") {
  if (taskStatus === "running") {
    return language === "en" ? "Drawing" : "绘制中";
  }
  if (taskStatus === "error") {
    return language === "en" ? "Retry available" : "可再画";
  }
  if (language === "en") {
    return page.imageSource === "bailian" ? "Picture book illustration" : "Demo illustration";
  }
  return page.imageSource === "bailian" ? "绘本插图" : "示意插图";
}

function getCulturePanelCopy(language: BookLanguage) {
  if (language === "en") {
    return {
      title: "Culture Mini-Guide",
      subtitle: "Mini encyclopedia cards pasted into the picture book",
      guideLabel: "Student Guide Script",
      noteLabel: "Page Mini Encyclopedia"
    };
  }

  return {
    title: "广西文化小百科",
    subtitle: "贴在绘本里的百科卡片",
    guideLabel: "小小文旅推荐官",
    noteLabel: "每页小百科"
  };
}

function getBookViewCopy(language: BookLanguage) {
  if (language === "en") {
    return {
      heroEyebrow: "Story Ready",
      readLink: "Read Picture Book",
      questionsTitle: "Gui Xiaoya's Questions",
      outlineTitle: "My Story Route",
      guideTitle: "Little Travel Guide",
      reflectionTitle: "My Creation Note",
      discoveryLabel: "Mini Encyclopedia",
      drawingButton: "Gui Xiaoya is drawing",
      redrawButton: "Try Another Illustration",
      drawButton: "Draw This Page",
      waitingImage: "This page is waiting for an illustration",
      drawingImage: "Gui Xiaoya is drawing this page...",
      pageLabel: (pageNumber: number) => `Page ${pageNumber}`,
      imageAlt: (pageNumber: number) => `Page ${pageNumber} illustration`
    };
  }

  return {
    heroEyebrow: "故事内容已整理",
    readLink: "开始读绘本",
    questionsTitle: "桂小雅的小问题",
    outlineTitle: "我的故事路线",
    guideTitle: "小小文旅推荐官",
    reflectionTitle: "我的创作小记",
    discoveryLabel: "小百科",
    drawingButton: "桂小雅在画",
    redrawButton: "换一张插图",
    drawButton: "补画这一页",
    waitingImage: "这页还在等插图",
    drawingImage: "桂小雅正在画这一页……",
    pageLabel: (pageNumber: number) => `第 ${pageNumber} 页`,
    imageAlt: (pageNumber: number) => `第 ${pageNumber} 页插图`
  };
}

function GenerationProgressPanel({ progress }: { progress: GenerationProgress }) {
  const percent = getProgressPercent(progress);
  const hasImageTasks = Object.values(progress.imageTasks).some((status) => status !== "idle");
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [progress.activityLog.length]);

  return (
    <section className={`progress-panel ${progress.error ? "has-error" : ""}`} aria-live="polite">
      <div className="progress-head">
        <div>
          <p className="eyebrow">绘本制作进度</p>
          <h3>{softenDisplayText(progress.title)}</h3>
          <p>{softenDisplayText(progress.detail)}</p>
        </div>
        <div className="progress-timer">
          <Clock size={18} />
          <span>陪伴 {progress.elapsedSeconds} 秒</span>
        </div>
      </div>

      <div className="progress-bar" aria-label={`当前进度 ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="step-track">
        {progressStages.map((stage) => {
          const state = getStepState(stage, progress);
          return (
            <div className={`step-pill ${state}`} key={stage}>
              {getStepIcon(state)}
              <span>{stageLabels[stage]}</span>
            </div>
          );
        })}
      </div>

      {hasImageTasks ? (
        <div className="image-task-grid">
          {[1, 2, 3, 4].map((pageNumber) => {
            const status = progress.imageTasks[pageNumber] || "idle";
            return (
              <div className={`image-task ${status}`} key={pageNumber}>
                <strong>第 {pageNumber} 页</strong>
                <span>{getImageTaskLabel(status)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {progress.activityLog.length ? (
        <div className="progress-stream">
          <div className="progress-stream-head">
            <span>
              <Sparkles size={15} />
              创作过程
            </span>
            <em>公开草稿流</em>
          </div>
          <div className="progress-stream-body" ref={streamRef}>
            {progress.activityLog.map((line, index) => (
              <p className={index === progress.activityLog.length - 1 ? "latest" : ""} key={`${line}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {softenDisplayText(line)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PostGenerateActions({ book, onDismiss }: { book: PictureBook; onDismiss: () => void }) {
  const language = book.language || "zh";
  return (
    <section className="post-generate-actions">
      <div>
        <p className="eyebrow">{language === "en" ? "Picture Book Ready" : "绘本已经准备好啦"}</p>
        <h3>{language === "en" ? "The storybook is bound" : "故事书已装订完成"}</h3>
        <p>{language === "en" ? "Open the new detail page to read the finished picture book." : "进入新的绘本详情页，慢慢阅读故事、插图和小百科。"}</p>
      </div>
      <div>
        <button className="secondary-button" type="button" onClick={onDismiss}>
          <BookOpen size={18} />
          {language === "en" ? "Stay in Studio" : "留在书桌"}
        </button>
        <a className="primary-button" href={getBookDetailHref(book.id)}>
          <ExternalLink size={18} />
          {language === "en" ? "Read Picture Book" : "开始读绘本"}
        </a>
      </div>
    </section>
  );
}

function BookReadyCard({ book }: { book: PictureBook }) {
  const language = book.language || "zh";
  return (
    <section className="post-generate-actions">
      <div>
        <p className="eyebrow">{language === "en" ? "Saved to Shelf" : "已放入我的书架"}</p>
        <h3>{displayBookText(book.title, language)}</h3>
        <p>{displayBookText(book.subtitle, language)}</p>
      </div>
      <div>
        <a className="primary-button" href={getBookDetailHref(book.id)}>
          <ExternalLink size={18} />
          {language === "en" ? "Read Picture Book" : "开始读绘本"}
        </a>
      </div>
    </section>
  );
}

function BookView({
  book,
  onGenerateImage,
  imageTasks
}: {
  book: PictureBook;
  onGenerateImage: (pageNumber: number) => Promise<PictureBook>;
  imageTasks?: Record<number, ImageTaskStatus>;
}) {
  const language = book.language || "zh";
  const cultureCopy = getCulturePanelCopy(language);
  const copy = getBookViewCopy(language);
  const cultureNotes = book.pages
    .map((page) => ({ pageNumber: page.pageNumber, text: displayBookText(page.cultureNote.trim(), language) }))
    .filter((item) => item.text);

  return (
    <div className="book-view">
      <section className="book-hero">
        <div>
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h2>{displayBookText(book.title, language)}</h2>
          <p>{displayBookText(book.subtitle, language)}</p>
        </div>
        <div className="tag-cluster">
          {book.heritageElements.map((item) => (
            <span className="heritage-tag" key={item}>
              {displayBookText(item, language)}
            </span>
          ))}
          {book.tourismElements.map((item) => (
            <span className="tourism-tag" key={item}>
              {displayBookText(item, language)}
            </span>
          ))}
          <a className="player-inline-link" href={getBookDetailHref(book.id)}>
            <ExternalLink size={15} />
            {copy.readLink}
          </a>
        </div>
      </section>

      <section className="guide-grid">
        <article>
          <h3>{copy.questionsTitle}</h3>
          <ul>
            {book.guidingQuestions.map((question) => (
              <li key={question}>{displayBookText(question, language)}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>{copy.outlineTitle}</h3>
          <p>{displayBookText(book.outline, language)}</p>
        </article>
        <article>
          <h3>{copy.guideTitle}</h3>
          <p>{displayBookText(book.tourGuideScript, language)}</p>
        </article>
      </section>

      <section className="culture-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{cultureCopy.subtitle}</p>
            <h3>{cultureCopy.title}</h3>
          </div>
        </div>
        <article className="culture-guide-card">
          <strong>{cultureCopy.guideLabel}</strong>
          <p>{displayBookText(book.tourGuideScript, language)}</p>
        </article>
        {cultureNotes.length ? (
          <div className="culture-note-list">
            <strong>{cultureCopy.noteLabel}</strong>
            {cultureNotes.map((item) => (
              <p key={item.pageNumber}>
                <span>{language === "en" ? `Page ${item.pageNumber}` : `第 ${item.pageNumber} 页`}</span>
                {item.text}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="page-grid">
        {book.pages.map((page) => {
          const taskStatus = imageTasks?.[page.pageNumber] || "idle";
          const imageButtonLabel =
            taskStatus === "running" ? copy.drawingButton : page.imageUrl ? copy.redrawButton : copy.drawButton;
          return (
            <article className={`page-card ${taskStatus === "running" ? "is-drawing" : ""}`} key={page.pageNumber}>
              <div className="page-image">
                {page.imageUrl ? (
                  <img src={page.imageUrl} alt={copy.imageAlt(page.pageNumber)} />
                ) : (
                  <div className="image-waiting">
                    {taskStatus === "running" ? <LoaderCircle size={34} /> : <ImageIcon size={34} />}
                    <span>{taskStatus === "running" ? copy.drawingImage : copy.waitingImage}</span>
                  </div>
                )}
                <span>{getImageSourceLabel(page, taskStatus, language)}</span>
              </div>
              <div className="page-copy">
                <p className="eyebrow">{copy.pageLabel(page.pageNumber)}</p>
                <h3>{displayBookText(page.title, language)}</h3>
                <p>{displayBookText(page.text, language)}</p>
                <div className="culture-note">
                  <strong>{copy.discoveryLabel}</strong>
                  <span>{displayBookText(page.cultureNote, language)}</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => void onGenerateImage(page.pageNumber)} disabled={taskStatus === "running"}>
                  {taskStatus === "running" ? <LoaderCircle size={16} /> : <RefreshCw size={16} />}
                  {imageButtonLabel}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="reflection">
        <h3>{copy.reflectionTitle}</h3>
        <p>{displayBookText(book.studentReflection, language)}</p>
      </section>
    </div>
  );
}

function PromptView({ records, language }: { records: PromptRecord[]; language: BookLanguage }) {
  return (
    <section className="prompt-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{language === "en" ? "Creation Notes" : "灵感记录"}</p>
          <h2>{language === "en" ? "Creation Record" : "这本书的创作记录"}</h2>
        </div>
      </div>
      {records.map((record) => (
        <article className="prompt-card" key={record.id}>
          <div>
            <span>{language === "en" ? record.type : getRecordTypeLabel(record.type)}</span>
            <strong>{displayRecordText(record.label, language)}</strong>
            <small>{formatDate(record.createdAt)}</small>
          </div>
          <details>
            <summary>{language === "en" ? "View the original prompt" : "查看当时的灵感说明"}</summary>
            <p className="prompt-text">{displayRecordText(record.prompt, language)}</p>
          </details>
          <p className="prompt-output">{displayRecordText(record.output, language)}</p>
        </article>
      ))}
    </section>
  );
}
