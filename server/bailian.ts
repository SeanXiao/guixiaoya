import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  makePromptRecord,
  nowIso,
  type BookLanguage,
  type PictureBook,
  type PictureBookPage,
  type PromptRecord,
  type ProtagonistGender
} from "./bookStore.js";
import {
  buildSceneFirstHeritageGuide,
  chooseHeritageElements,
  chooseTourismElements,
  createFallbackBook,
  localizeGuangxiText
} from "./guangxiFallback.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type BookDraft = Omit<PictureBook, "id" | "createdAt" | "updatedAt" | "promptRecords">;

type InspirationChipResponse = {
  contextLabel?: string;
  chips?: string[];
};

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedDir = join(rootDir, "data", "generated");
const fallbackGeneratedImageMaxBytes = 2 * 1024 * 1024;
const fallbackGeneratedImageMaxSide = 1024;
const fallbackGeneratedImageJpegQuality = 86;

function dashScopeKey() {
  return process.env.DASHSCOPE_API_KEY?.trim() || process.env.BAILIAN_API_KEY?.trim() || "";
}

function textBaseUrl() {
  return (process.env.BAILIAN_TEXT_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/u, "");
}

function textModel() {
  return process.env.BAILIAN_TEXT_MODEL || "qwen3.7-max";
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function storyTextModel() {
  return process.env.BAILIAN_STORY_TEXT_MODEL || process.env.BAILIAN_TEXT_MODEL || "deepseek-v4-pro";
}

function storyTextMaxTokens() {
  return numberFromEnv("BAILIAN_STORY_TEXT_MAX_TOKENS", 4200);
}

function storyTextTimeoutMs() {
  return numberFromEnv("BAILIAN_STORY_TEXT_TIMEOUT_MS", 90000);
}

function inspirationTextModel() {
  return process.env.BAILIAN_INSPIRATION_TEXT_MODEL || process.env.BAILIAN_FAST_TEXT_MODEL || "qwen-turbo";
}

function inspirationTextTimeoutMs() {
  return numberFromEnv("BAILIAN_INSPIRATION_TEXT_TIMEOUT_MS", 20000);
}

function imageModel() {
  return process.env.BAILIAN_IMAGE_MODEL || "wan2.7-image-pro";
}

function imageSize() {
  return process.env.BAILIAN_IMAGE_SIZE || "1K";
}

function generatedImageMaxBytes() {
  return numberFromEnv("GENERATED_IMAGE_MAX_BYTES", fallbackGeneratedImageMaxBytes);
}

function generatedImageMaxSide() {
  return numberFromEnv("GENERATED_IMAGE_MAX_SIDE", fallbackGeneratedImageMaxSide);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function generatedImageJpegQuality() {
  return clampNumber(numberFromEnv("GENERATED_IMAGE_JPEG_QUALITY", fallbackGeneratedImageJpegQuality), 60, 92);
}

export function hasBailianKey() {
  return Boolean(dashScopeKey());
}

export function getBailianRuntimeStatus() {
  return {
    configured: hasBailianKey(),
    textModel: textModel(),
    storyTextModel: storyTextModel(),
    storyTextTimeoutMs: storyTextTimeoutMs(),
    inspirationTextModel: inspirationTextModel(),
    inspirationTextTimeoutMs: inspirationTextTimeoutMs(),
    imageModel: imageModel(),
    imageSize: imageSize()
  };
}

export async function generateSeasonalInspirationChips(options: {
  currentDate?: string;
  currentIdea?: string;
  existingChips?: string[];
  language?: BookLanguage;
  randomSeed?: string;
  refreshCount?: number;
}) {
  const language = options.language || "zh";
  const parsedDate = options.currentDate ? new Date(options.currentDate) : new Date();
  const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const contextLabel = getSeasonalContext(date, language);
  const fallback = fallbackInspirationChips(language, contextLabel, options.currentIdea || "", options.existingChips || [], options.refreshCount || 1);

  if (!hasBailianKey()) {
    return { contextLabel, chips: fallback, source: "local" as const };
  }

  const randomSeed = options.randomSeed || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sceneGuide = buildSceneFirstHeritageGuide(options.currentIdea || `${contextLabel}-${randomSeed}`, language);
  const systemPrompt =
    language === "en"
      ? [
          "You are Gui Xiaoya, an inspiration coach for elementary-school Guangxi picture books.",
          "Every request is a live brainstorming task, not a template rewrite. Create fresh one-sentence story idea chips for children ages 6-12.",
          "Randomly choose different Guangxi cities, counties, scenic spots, neighborhoods, museums, villages, farms, beaches, mountains, rivers, or old streets.",
          "Each chip must include one specific Guangxi place and one concrete, playful, different event. Avoid vague culture words.",
          "Avoid repeating famous symbols by default. Do not use Zhuang brocade or bronze drums unless the idea itself clearly needs them.",
          "For Children's Day, treat the context as a refresh point named Children's Day Fun. Include playful child-centered ideas and allow naturally fitting intangible-heritage ideas.",
          "At least 2 chips should include a clear Guangxi intangible heritage or local craft, such as Dong grand song, Beihai shell carving, Tianqin singing, Liubao tea, Maonan flower bamboo hats, Nixing pottery, Huashan rock paintings, or five-color sticky rice.",
          "Use child-friendly hooks such as games, riddles, nature watching, postcards, treasure hunts, songs, or class trips. Avoid romance or love-song wording.",
          "The 6 chips should use 6 different Guangxi cities/counties/areas when possible, such as Nanning, Liuzhou, Guilin, Wuzhou, Beihai, Fangchenggang, Qinzhou, Guigang, Yulin, Baise, Hezhou, Hechi, Laibin, Chongzuo, Sanjiang, Rongxian, Longsheng, or Huanjiang.",
          sceneGuide,
          "Output JSON only."
        ].join("\n")
      : [
          "你是桂小雅，负责给小学组孩子设计广西绘本灵感锦囊。",
          "每次请求都要像现场头脑风暴，不要套用固定模板，也不要只改几个字。",
          "请创作新鲜的一句话儿童小故事灵感，适合 6-12 岁孩子继续做绘本。",
          "随机选择不同广西城市、县区、景点、街巷、博物馆、村寨、农田、海滩、山水或老街。",
          "每条必须同时包含一个具体广西地点和一个具体好玩的事件，避免只写空泛的文化词。",
          "不要默认使用壮锦或铜鼓，除非灵感本身明确需要。",
          "如果是六一前后，请把“六一童趣”当成一个刷新点：每次都要有儿童节游戏感、班级活动感或童话感。",
          "允许并鼓励自然加入非遗相关锦囊；至少 2 条要出现清楚的广西非遗或地方手作，例如侗族大歌、北海贝雕、天琴弹唱、六堡茶、毛南花竹帽、钦州坭兴陶、花山岩画、五色糯米饭等。",
          "故事钩子用游戏、谜题、自然观察、明信片、寻宝、童谣、班级出游等儿童视角，避免爱情或情歌表达。",
          "6 条尽量使用 6 个不同广西城市/县区/片区，例如南宁、柳州、桂林、梧州、北海、防城港、钦州、贵港、玉林、百色、贺州、河池、来宾、崇左、三江、容县、龙胜、环江等。",
          sceneGuide,
          "只输出 JSON。"
        ].join("\n");

  const userPrompt =
    language === "en"
      ? [
          `Current context: ${contextLabel}`,
          `Refresh round: ${options.refreshCount || 1}`,
          `Random seed for this click: ${randomSeed}`,
          `Current student idea, if any: ${options.currentIdea || "none"}`,
          `Avoid ideas too similar to these existing chips: ${(options.existingChips || []).join(" | ") || "none"}`,
          "Return JSON with fields:",
          "contextLabel: a short seasonal label",
          "chips: exactly 6 short child-friendly story ideas, each 8-18 English words, no numbering.",
          "Hard rules: 6 different Guangxi places/cities/counties if possible; each chip needs a place + a different event/action; do not reuse the examples verbatim; at most 1 chip may continue the current student idea."
        ].join("\n")
      : [
          `当前时令：${contextLabel}`,
          `刷新次数：${options.refreshCount || 1}`,
          `本次点击随机种子：${randomSeed}`,
          `当前孩子写下的灵感：${options.currentIdea || "无"}`,
          `请避开这些已有锦囊的相似表达：${(options.existingChips || []).join(" | ") || "无"}`,
          "请返回 JSON，字段：",
          "contextLabel: 8 字以内的时令标签",
          "chips: 正好 6 条中文灵感锦囊，每条 10-26 个字，不要编号。",
          "硬性规则：尽量 6 个不同广西城市/县区/片区；每条都要有具体地点 + 不同事件动作；不要照抄示例；最多 1 条延续当前灵感，其余都必须换地点、换文化亮点、换情节钩子。"
        ].join("\n");

  try {
    const content = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], { maxTokens: 520, model: inspirationTextModel(), temperature: 0.95, timeoutMs: inspirationTextTimeoutMs() });
    const parsed = extractJsonValue<InspirationChipResponse>(content);
    const generatedChips = normalizeInspirationChips(parsed.chips || [], language, false)
      .filter((chip) => !isUnsupportedDefaultHeritage(chip, options.currentIdea || contextLabel));
    const chips = pickDiverseInspirationChips(
      generatedChips.concat(fallback),
      options.existingChips || [],
      `${options.currentIdea || ""}|${contextLabel}|${options.refreshCount || 1}|${randomSeed}`,
      language
    );
    return { contextLabel: parsed.contextLabel || contextLabel, chips, source: "bailian" as const };
  } catch {
    return { contextLabel, chips: fallback, source: "local" as const };
  }
}

function extractJsonValue<T>(text: string) {
  const cleaned = text
    .replace(/^```json\s*/iu, "")
    .replace(/^```\s*/iu, "")
    .replace(/```$/u, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("AI response did not include JSON");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function extractJson(text: string) {
  return extractJsonValue<BookDraft>(text);
}

function useGuiXiaolingName(value: unknown = "", language: BookLanguage = "zh") {
  const text = Array.isArray(value) ? value.join(language === "en" ? ", " : "、") : String(value || "");
  if (!text) {
    return text;
  }

  if (language === "en") {
    return text
      .replace(/\bAI\s+(assistant|helper|companion|robot)\b/giu, "Gui Xiaoya")
      .replace(/\bthe\s+assistant\b/giu, "Gui Xiaoya")
      .replace(/\bmy\s+assistant\b/giu, "Gui Xiaoya")
      .replace(/\bXiaoyuan\b/giu, "Gui Xiaoya");
  }

  return text
    .replace(/AI\s*伙伴(?=桂小雅)/gu, "")
    .replace(/AI\s*伙伴/gu, "桂小雅")
    .replace(/AI\s*小助手/gu, "桂小雅")
    .replace(/AI\s*助手/gu, "桂小雅")
    .replace(/智能小助手/gu, "桂小雅")
    .replace(/小助手/gu, "桂小雅")
    .replace(/小圆/gu, "桂小雅");
}

function guiXiaolingVisualSpec(language: BookLanguage = "zh") {
  if (language === "en") {
    return [
      "Gui Xiaoya visual lock: a cute glossy white-and-blue round robot mascot with a glowing cyan face and heart, headset microphone, friendly childlike smile, and soft toy-like proportions.",
      "Guangxi design details: indigo ethnic-inspired headscarf with teal, white, red, and gold geometric trim, small silver-inspired charm by the knot, blue cape, and subtle Guangxi ethnic pattern accents on the cuffs, cape, and notebook. Do not treat these costume details as mandatory story heritage themes.",
      "In picture-book images, Gui Xiaoya must be the consistent companion robot character, not a generic AI assistant, human child, animal, or unrelated robot."
    ].join(" ");
  }

  return [
    "桂小雅视觉锁定：可爱的白蓝配色圆润机器人吉祥物，黑色发光屏幕脸、青蓝色笑脸和爱心灯、耳麦、亲切儿童化表情，整体像柔和精致的三维玩具机器人。",
    "广西特色细节：靛蓝民族风格头巾，带青蓝、白、红、金色几何边纹，头巾结旁有轻巧银饰小挂件；蓝色披风、袖口/披风/本子有少量广西民族纹样点缀。不要把这些装饰当成故事必须出现的非遗主题。",
    "绘本插图中，桂小雅必须作为固定的画册机器人伙伴出现，不要画成普通智能助手、人类小孩、动物或其他无关机器人。"
  ].join(" ");
}

function protagonistVisualSpec(language: BookLanguage = "zh", gender: ProtagonistGender = "girl") {
  if (language === "en") {
    return gender === "boy"
      ? "Student protagonist visual lock: one 8-10 year-old Guangxi elementary-school boy, bright eyes, friendly expression, simple red-blue jacket with subtle Guangxi ethnic pattern accents, small backpack."
      : "Student protagonist visual lock: one 8-10 year-old Guangxi elementary-school girl, bright eyes, friendly expression, simple red-blue jacket with subtle Guangxi ethnic pattern accents, small backpack.";
  }

  return gender === "boy"
    ? "小学生主角视觉锁定：一位八到十岁广西小学生男孩，明亮眼睛、友好表情，穿红蓝相间、带少量广西民族纹样点缀的小外套，背一个小书包。"
    : "小学生主角视觉锁定：一位八到十岁广西小学生女孩，明亮眼睛、友好表情，穿红蓝相间、带少量广西民族纹样点缀的小外套，背一个小书包。";
}

function textFreeImageRule(language: BookLanguage = "zh") {
  if (language === "en") {
    return [
      "No readable text rule: the final illustration must contain zero readable characters.",
      "Do not draw Chinese characters, English letters, pinyin, numbers, punctuation, captions, dialogue bubbles, labels, signs, plaques, banners, page numbers, subtitles, watermarks, logos, UI, book text, paper notes, museum panels, monuments, or inscriptions.",
      "If the scene naturally contains a sign, plaque, book, paper, banner, monument, or display board, render it blank, decorative, or as unreadable texture only."
    ].join(" ");
  }

  return [
    "无文字画面规则：最终插图中不得出现任何可读字符。",
    "不要画汉字、英文、拼音、数字、标点、字幕、对白气泡、标签、招牌、牌匾、横幅、页码、水印、标识、界面文字、书页文字、纸条、展板、纪念碑文字或题字。",
    "如果场景自然包含招牌、牌匾、书本、纸张、横幅、纪念碑或展板，请画成空白、装饰纹理或不可读纹理。"
  ].join(" ");
}

function withCharacterImagePrompt(prompt = "", language: BookLanguage = "zh", protagonistGender: ProtagonistGender = "girl") {
  const namedPrompt = useGuiXiaolingName(prompt, language);
  const protagonistMarker = language === "en" ? "Student protagonist visual lock" : "小学生主角视觉锁定";
  const robotMarker = language === "en" ? "Gui Xiaoya visual lock" : "桂小雅视觉锁定";
  const textRuleMarker = language === "en" ? "No readable text rule" : "无文字画面规则";
  const promptParts = [namedPrompt];

  if (!namedPrompt.includes(protagonistMarker)) {
    promptParts.push(protagonistVisualSpec(language, protagonistGender));
  }

  if (!namedPrompt.includes(robotMarker)) {
    promptParts.push(guiXiaolingVisualSpec(language));
  }

  if (!namedPrompt.includes(textRuleMarker)) {
    promptParts.push(textFreeImageRule(language));
  }

  return promptParts.filter(Boolean).join("\n");
}

function ideaMentionsAny(idea: string, keywords: string[]) {
  const normalizedIdea = idea.toLowerCase();
  return keywords.some((keyword) => normalizedIdea.includes(keyword.toLowerCase()));
}

function isUnsupportedDefaultHeritage(item: string, idea: string) {
  if (/壮锦|brocade/iu.test(item)) {
    return !ideaMentionsAny(idea, ["壮锦", "织锦", "织造", "织布", "锦", "纹样", "brocade", "weaving", "pattern"]);
  }

  if (/铜鼓|bronze drum/iu.test(item)) {
    return !ideaMentionsAny(idea, ["铜鼓", "鼓声", "鼓", "bronze drum", "drum"]);
  }

  if (/绣球/iu.test(item)) {
    return !ideaMentionsAny(idea, ["绣球", "抛绣球", "三月三", "歌圩"]);
  }

  if (/山歌|刘三姐/iu.test(item)) {
    return !ideaMentionsAny(idea, ["山歌", "唱歌", "对歌", "歌圩", "三月三", "刘三姐", "漓江", "阳朔"]);
  }

  if (/三月三/iu.test(item)) {
    return !ideaMentionsAny(idea, ["三月三", "歌圩", "节日"]);
  }

  return false;
}

function sceneFirstHeritageElements(idea: string, rawItems: string[], language: BookLanguage) {
  const suggested = chooseHeritageElements(idea, 5).map((item) => cleanGeneratedText(item, language));
  const items = rawItems
    .map((item) => cleanGeneratedText(item, language))
    .filter(Boolean)
    .filter((item) => !isUnsupportedDefaultHeritage(item, idea));
  const merged = [...items, ...suggested].filter((item, index, array) => array.indexOf(item) === index);
  return merged.slice(0, 5);
}

function sceneFirstTourismElements(idea: string, rawItems: string[], language: BookLanguage) {
  const rawSuggested = chooseTourismElements(idea, 4);
  const suggested = rawSuggested.map((item) => cleanGeneratedText(item, language));
  const items = rawItems.map((item) => cleanGeneratedText(item, language)).filter(Boolean);
  const sceneMatched = rawSuggested.concat(suggested).some((item) => ideaMentionsAny(idea, [item, ...item.split(/[、,，\s]+/u)]));
  const merged = [...suggested, ...(sceneMatched ? [] : items)].filter((item, index, array) => array.indexOf(item) === index);
  return merged.slice(0, 5);
}

function draftHasUnsupportedDefaultSignals(draft: BookDraft, idea: string) {
  const text = [
    draft.title,
    draft.subtitle,
    draft.outline,
    draft.tourGuideScript,
    draft.studentReflection,
    ...(draft.heritageElements || []),
    ...(draft.tourismElements || []),
    ...(draft.pages || []).flatMap((page) => [page.title, page.text, page.cultureNote, page.imagePrompt])
  ]
    .map((item) => useGuiXiaolingName(item))
    .join("\n");
  return ["绣球", "山歌", "刘三姐", "三月三", "歌圩", "壮锦", "铜鼓"].some(
    (item) => text.includes(item) && isUnsupportedDefaultHeritage(item, idea)
  );
}

function cleanGeneratedText(value: unknown = "", language: BookLanguage = "zh") {
  return localizeGuangxiText(useGuiXiaolingName(value, language), language)
    .replace(/\b(undefined|null|nan)\b/giu, "")
    .replace(/未定义/gu, "")
    .replace(/毛茸茸的小手/gu, "圆圆的小机械手")
    .replace(/毛茸茸的手/gu, "圆润的机械手")
    .replace(/毛茸茸/gu, "圆润")
    .replace(/和\s*([。！？!?；;，,])/gu, "$1")
    .replace(/与\s*([。！？!?；;，,])/gu, "$1")
    .replace(/\s+([。！？!?；;，,])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function containsLatinLetters(value = "") {
  return /[A-Za-z]/u.test(value);
}

function compactImagePromptText(value = "", maxLength = 120) {
  const clean = value.replace(/\s+/gu, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength).replace(/[，,、；;：:\s]+$/gu, "")}。`;
}

function replaceCommonEnglishInChineseImagePrompt(prompt = "") {
  return prompt
    .replace(/children'?s book illustration/giu, "儿童绘本插图")
    .replace(/watercolor style/giu, "水彩风格")
    .replace(/watercolor/giu, "水彩")
    .replace(/new[-\s]?Chinese illustration style/giu, "国潮插画风格")
    .replace(/No readable text/giu, "画面无可读文字")
    .replace(/No text/giu, "画面无文字")
    .replace(/No letters/giu, "不要画字母")
    .replace(/No numbers/giu, "不要画数字")
    .replace(/No signs/giu, "不要画招牌")
    .replace(/No watermarks/giu, "不要画水印")
    .replace(/\bGui Xiaoya\b/giu, "桂小雅")
    .replace(/\bAI\b/giu, "智能")
    .replace(/\b3D\b/giu, "三维")
    .replace(/\bLogo\b/giu, "标识")
    .trim();
}

function buildChineseImagePromptFromPage(pageTitle = "", pageText = "", cultureNote = "") {
  const parts = [
    "儿童绘本插图，温暖明亮的水彩风格，画面适合小学生阅读。",
    pageTitle ? `本页主题：${pageTitle}。` : "",
    pageText ? `画面表现：${compactImagePromptText(pageText, 140)}` : "",
    cultureNote ? `广西文化细节：${compactImagePromptText(cultureNote, 90)}` : "",
    "只画一个关键瞬间，突出人物动作、环境和地方文化细节，不要出现任何可读文字。"
  ];
  return parts.filter(Boolean).join("\n");
}

function ensureChineseImagePrompt(prompt = "", pageTitle = "", pageText = "", cultureNote = "") {
  const localizedPrompt = replaceCommonEnglishInChineseImagePrompt(cleanGeneratedText(prompt, "zh"));
  if (localizedPrompt && !containsLatinLetters(localizedPrompt)) {
    return localizedPrompt;
  }
  return buildChineseImagePromptFromPage(pageTitle, pageText, cultureNote);
}

function compactStoryText(value = "") {
  return value.replace(/[\s，。！？、；：,.!?;:"“”‘’《》()（）-]/gu, "");
}

function getIdeaAnchorGroups(idea: string) {
  const groups = [
    { triggers: ["三娘湾", "sanniang"], required: ["三娘湾", "钦州三娘湾"] },
    { triggers: ["钦州", "qinzhou"], required: ["钦州"] },
    { triggers: ["海豚", "狗海豚", "白海豚", "中华白海豚", "dolphin"], required: ["海豚", "白海豚", "中华白海豚"] },
    { triggers: ["螃蟹", "蟹", "钓螃蟹", "赶海", "crab"], required: ["螃蟹", "蟹", "蟹洞", "赶海"] },
    { triggers: ["烧烤", "烤", "barbecue"], required: ["烧烤", "烤虾", "烤玉米", "烤"] },
    { triggers: ["海边", "沙滩", "大海", "海湾", "浪花"], required: ["海边", "沙滩", "大海", "海湾", "海风", "浪花"] },
    { triggers: ["柳州"], required: ["柳州"] },
    { triggers: ["鱼峰山"], required: ["鱼峰山"] },
    { triggers: ["对歌", "山歌", "歌圩"], required: ["对歌", "山歌", "歌圩"] },
    { triggers: ["三月三"], required: ["三月三"] },
    { triggers: ["螺蛳粉"], required: ["螺蛳粉"] },
    { triggers: ["漓江"], required: ["漓江"] },
    { triggers: ["刘三姐"], required: ["刘三姐"] }
  ];
  return groups.filter((group) => ideaMentionsAny(idea, group.triggers));
}

function draftKeepsCoreIdea(draft: BookDraft, idea: string) {
  const anchors = getIdeaAnchorGroups(idea);
  if (!anchors.length) {
    return true;
  }

  const text = [
    draft.title,
    draft.subtitle,
    draft.outline,
    draft.tourGuideScript,
    draft.studentReflection,
    ...(draft.heritageElements || []),
    ...(draft.tourismElements || []),
    ...(draft.pages || []).flatMap((page) => [page.title, page.text, page.cultureNote, page.imagePrompt])
  ]
    .map((item) => cleanGeneratedText(item))
    .join("\n");

  const matchedCount = anchors.filter((group) => ideaMentionsAny(text, group.required)).length;
  const hasNamedPlace = anchors.some((group) => group.triggers.includes("三娘湾") || group.triggers.includes("鱼峰山"));
  if (hasNamedPlace && matchedCount < Math.min(2, anchors.length)) {
    return false;
  }
  return matchedCount / anchors.length >= 0.6;
}

function draftHasUnrelatedSceneDrift(draft: BookDraft, idea: string) {
  const text = [
    draft.title,
    draft.subtitle,
    draft.outline,
    draft.tourGuideScript,
    ...(draft.heritageElements || []),
    ...(draft.tourismElements || []),
    ...(draft.pages || []).flatMap((page) => [page.title, page.text, page.cultureNote])
  ]
    .map((item) => cleanGeneratedText(item))
    .join("\n");

  if (ideaMentionsAny(idea, ["三娘湾", "海豚", "螃蟹", "钓螃蟹", "烧烤", "海边"])) {
    return ideaMentionsAny(text, ["百色", "芒果园", "右江河谷", "田东芒果", "田阳芒果"]);
  }
  return false;
}

function draftHasThinOrBrokenPages(draft: BookDraft, language: BookLanguage) {
  const pages = Array.isArray(draft.pages) ? draft.pages.slice(0, 4) : [];
  if (pages.length < 4) {
    return true;
  }

  return pages.some((page) => {
    const text = cleanGeneratedText(page.text, language);
    if (!text || /\b(undefined|null|nan)\b/iu.test(String(page.text || ""))) {
      return true;
    }
    if (language === "en") {
      return text.split(/\s+/u).filter(Boolean).length < 35;
    }
    return compactStoryText(text).length < 80;
  });
}

function getSeasonalContext(date = new Date(), language: BookLanguage = "zh") {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month === 5 && day >= 20) {
    return language === "en" ? "Children's Day Fun" : "六一童趣";
  }
  if (month === 6 && day <= 8) {
    return language === "en" ? "Children's Day Fun" : "六一童趣";
  }
  if (month === 6 || month === 7 || month === 8) {
    return language === "en" ? "early summer and summer vacation" : "初夏和暑假";
  }
  if (month === 9) {
    return language === "en" ? "new school year" : "新学期开学季";
  }
  if (month === 10) {
    return language === "en" ? "autumn travel season" : "秋游季";
  }
  if (month === 1 || month === 2) {
    return language === "en" ? "winter vacation and Spring Festival" : "寒假和春节";
  }
  return language === "en" ? "today's season" : "最近的时令";
}

function fallbackInspirationChips(language: BookLanguage, contextLabel: string, currentIdea = "", existingChips: string[] = [], refreshCount = 1) {
  const childDay = /儿童节|Children|六一|童趣/iu.test(contextLabel);
  const summer = /夏|暑假|summer/iu.test(contextLabel);
  const basePool =
    language === "en"
      ? childDay
        ? [
            "A Children's Day shell stage on Beihai Silver Beach",
            "A Dong grand song gift under Sanjiang Wind-Rain Bridge",
            "A Liu Sanjie chorus map drifting on the Li River",
            "A Liuzhou luosifen aroma parade for my classmates",
            "A Tianqin melody party beside Detian Waterfall",
            "A Wuzhou Liubao tea postcard in Qilou City",
            "A Baise red-scarf time mailbox beside Youjiang River",
            "A Fangchenggang Jingzu one-string zither sea concert",
            "A Qinzhou Nixing pottery birthday cup in Sanniang Bay",
            "A Hezhou Huangyao Ancient Town shadow-play mission",
            "A Hechi Maonan bamboo-hat parade for Children's Day",
            "A Yulin Zhenwu Pavilion cloud staircase adventure",
            "A Huashan rock-painting shadow game for Children's Day",
            "A five-color sticky-rice picnic clue on Qingxiu Mountain",
            "A Nanning Zoo red-panda drawing mission"
          ]
        : summer
          ? [
              "A summer firefly map in Huangyao Ancient Town",
              "A bamboo raft story song on the Li River",
              "A shell-carving treasure hunt on Beihai Silver Beach",
              "A Tianqin echo beside Detian Waterfall",
              "A rice-field cloud game at Longji Terraces",
              "A night-market culture clue in Liuzhou",
              "A Wuzhou arcade street Liubao tea cooling station",
              "A Baise mango orchard color clue",
              "A Fangchenggang dolphin-message summer diary",
              "A Qinzhou pottery workshop rainstorm rescue"
            ]
          : [
              "A shell-carving secret on Beihai Silver Beach",
              "A Dong grand song floating from Sanjiang Wind-Rain Bridge",
              "A Li River mountain-song map with Gui Xiaoya",
              "A Liuzhou food-market culture clue",
              "A Tianqin echo at Detian Waterfall",
              "A Longji Terrace farming story in the clouds",
              "A Wuzhou Liubao tea scent trail",
              "A Baise Youjiang riverbank story box",
              "A Qinzhou Nixing pottery color change",
              "A Fangchenggang Jingzu sea-song clue"
            ]
      : childDay
        ? [
            "六一儿童节在北海银滩搭起贝雕小舞台",
            "三江风雨桥下把侗族大歌送给小伙伴",
            "漓江竹筏上的刘三姐童声合唱地图",
            "柳州螺蛳粉香气里的儿童节游园会",
            "德天瀑布边响起天琴生日派对",
            "梧州骑楼城寄出六堡茶香明信片",
            "百色右江边的红领巾时光信箱",
            "防城港白浪滩上的独弦琴海风音乐会",
            "钦州坭兴陶杯装下三娘湾的海浪",
            "贺州黄姚古镇里的皮影寻路任务",
            "河池毛南花竹帽带来六一巡游",
            "玉林真武阁楼梯变成云朵迷宫",
            "贵港荷花池里开出会讲故事的莲灯",
            "来宾圣堂山云海送来瑶族童话信",
            "崇左花山岩画小人跳出红色舞步",
            "南宁动物园的小熊猫六一画展",
            "青秀山五色糯米饭野餐任务",
            "梧州六堡茶香里的儿童节邮局",
            "钦州坭兴陶小杯接住海豚笑声",
            "三江侗族大歌变成班级回声游戏"
          ]
        : summer
          ? [
              "黄姚古镇里的暑假萤火虫地图",
              "漓江竹筏上的夏日山歌漂流",
              "北海银滩上的贝雕寻宝小队",
              "德天瀑布边的天琴回声邮局",
              "龙脊梯田云朵里的农耕游戏",
              "柳州夜市里的文化味道线索",
              "梧州骑楼街的六堡茶清凉驿站",
              "百色芒果园里的颜色密码",
              "防城港海边收到京族哈节邀请",
              "钦州坭兴陶工坊里的雨天救援",
              "贺州姑婆山瀑布藏着森林歌谱",
              "河池小朋友戴花竹帽追云影"
            ]
          : [
              "北海银滩上的贝雕秘密",
              "三江风雨桥飘来的侗族大歌",
              "桂小雅和漓江上的山歌地图",
              "柳州美食集市里的文化线索",
              "德天瀑布边的天琴回声",
              "龙脊梯田云朵里的农耕故事",
              "梧州六堡茶香飘进骑楼小巷",
              "百色右江岸边的故事盒子",
              "钦州坭兴陶变出海浪颜色",
              "防城港京族海歌带来贝壳信",
              "贺州黄姚古镇月光下的豆豉香",
              "河池毛南花竹帽找到彩虹路"
            ];

  return pickDiverseInspirationChips(basePool, existingChips, `${currentIdea}|${contextLabel}|${refreshCount}`, language);
}

function normalizeInspirationChips(items: string[], language: BookLanguage, shouldLimit = true) {
  const maxLength = language === "en" ? 96 : 34;
  const cleaned = items
    .map((item) => useGuiXiaolingName(String(item || ""), language).replace(/[。.!！]+$/u, "").trim())
    .filter((item) => item.length >= 6 && item.length <= maxLength)
    .filter((item) => !/情歌|爱情|恋爱|romance|love song/iu.test(item))
    .filter((item) => !isUnsupportedDefaultHeritage(item, item))
    .filter((item, index, array) => array.indexOf(item) === index);
  return shouldLimit ? cleaned.slice(0, 6) : cleaned;
}

function chipTokens(text: string) {
  return new Set(
    text
      .replace(/[，。！？、,.!?]/gu, "")
      .split(/(?=[\s\S])/u)
      .filter((char) => char.trim())
  );
}

function isSimilarChip(candidate: string, existing: string[]) {
  const cityOrScene = candidate.match(/百色|崇左|桂林|柳州|梧州|北海|防城港|钦州|贺州|河池|三江|龙脊|德天|黄姚|青秀山|银滩|漓江|骑楼|右江|花山|真武阁|圣堂山/u)?.[0];
  const storySignal = candidate.match(/三月三|歌圩|绣球|山歌|壮锦|铜鼓|刘三姐|贝雕|侗族大歌|螺蛳粉|天琴|六堡茶|红领巾|独弦琴|坭兴陶|皮影|花竹帽|花山岩画|蜡染|五色糯米饭/u)?.[0];
  return existing.some((item) => {
    if (item === candidate) {
      return true;
    }
    if (cityOrScene && item.includes(cityOrScene)) {
      return true;
    }
    if (storySignal && item.includes(storySignal)) {
      return true;
    }
    const left = chipTokens(candidate);
    const right = chipTokens(item);
    const overlap = [...left].filter((token) => right.has(token)).length;
    return overlap / Math.max(1, Math.min(left.size, right.size)) > 0.62;
  });
}

function pickDiverseInspirationChips(items: string[], existingChips: string[], currentIdea: string, language: BookLanguage) {
  const seed = currentIdea || existingChips.join("|") || getSeasonalContext(new Date(), language);
  const candidates = rotateList(normalizeInspirationChips(items, language, false), seed);
  const avoidChips = existingChips.concat(currentIdea ? [currentIdea] : []);
  const picked: string[] = [];
  for (const candidate of candidates) {
    if (picked.length >= 6) {
      break;
    }
    if (!isSimilarChip(candidate, avoidChips.concat(picked))) {
      picked.push(candidate);
    }
  }
  return picked.concat(candidates.filter((candidate) => !picked.includes(candidate))).slice(0, 6);
}

function rotateList<T>(items: T[], seed: string) {
  if (!items.length) {
    return items;
  }
  const start = [...seed].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

function normalizeChatContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const part = item as { content?: unknown; text?: unknown };
          if (typeof part.text === "string") {
            return part.text;
          }
          if (typeof part.content === "string") {
            return part.content;
          }
        }
        return "";
      })
      .join("");
  }
  return "";
}

async function chatCompletion(
  messages: ChatMessage[],
  options?: { maxTokens?: number; model?: string; temperature?: number; timeoutMs?: number }
) {
  if (!dashScopeKey()) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

  const controller = options?.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), options!.timeoutMs) : null;
  const response = await fetch(`${textBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dashScopeKey()}`,
      "Content-Type": "application/json"
    },
    signal: controller?.signal,
    body: JSON.stringify({
      model: options?.model || textModel(),
      messages,
      temperature: options?.temperature ?? 0.78,
      max_tokens: options?.maxTokens || 2600
    })
  }).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Bailian text request failed with HTTP ${response.status}`);
  }

  const content = normalizeChatContent(payload?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("Bailian text model returned empty content");
  }
  return content;
}

function normalizeDraft(idea: string, draft: BookDraft, language: BookLanguage, protagonistGender: ProtagonistGender): BookDraft {
  const fallback = createFallbackBook(idea, language, protagonistGender);
  const pages = Array.isArray(draft.pages) && draft.pages.length ? draft.pages.slice(0, 4) : fallback.pages;
  const rawHeritage = Array.isArray(draft.heritageElements) && draft.heritageElements.length ? draft.heritageElements : fallback.heritageElements;

  return {
    title: cleanGeneratedText(draft.title || fallback.title, language),
    subtitle: cleanGeneratedText(draft.subtitle || fallback.subtitle, language),
    originalIdea: idea,
    language,
    protagonistGender,
    heritageElements: sceneFirstHeritageElements(idea, rawHeritage, language),
    tourismElements: sceneFirstTourismElements(idea, draft.tourismElements || fallback.tourismElements, language),
    guidingQuestions: (draft.guidingQuestions || fallback.guidingQuestions).slice(0, 3).map((item) => cleanGeneratedText(item, language)),
    outline: cleanGeneratedText(draft.outline || fallback.outline, language),
    pages: pages.map((page, index) => {
      const title = cleanGeneratedText(page.title || fallback.pages[index]?.title || `第 ${index + 1} 页`, language);
      const text = cleanGeneratedText(page.text || fallback.pages[index]?.text || "", language);
      const cultureNote = cleanGeneratedText(page.cultureNote || fallback.pages[index]?.cultureNote || "", language);
      const rawImagePrompt = page.imagePrompt || fallback.pages[index]?.imagePrompt || "";
      const imagePrompt =
        language === "zh"
          ? ensureChineseImagePrompt(rawImagePrompt, title, text, cultureNote)
          : cleanGeneratedText(rawImagePrompt, language);
      return {
        pageNumber: index + 1,
        title,
        text,
        imagePrompt: withCharacterImagePrompt(imagePrompt, language, protagonistGender),
        imageUrl: page.imageUrl || "",
        imageSource: page.imageSource || "placeholder",
        cultureNote
      };
    }),
    tourGuideScript: cleanGeneratedText(draft.tourGuideScript || fallback.tourGuideScript, language),
    studentReflection: cleanGeneratedText(draft.studentReflection || fallback.studentReflection, language),
    aiContentRatio: Number(draft.aiContentRatio || 90)
  };
}

function getCoreStoryPromptLabel(language: BookLanguage) {
  return language === "en" ? "Core Story Creation Prompt" : "核心创建故事提示词";
}

function buildCoreStoryPromptRecord(idea: string, systemPrompt: string, userPrompt: string, language: BookLanguage) {
  const brief =
    language === "en"
      ? `Turn the student's idea "${idea}" into a 4-page Guangxi culture and travel picture book; introduce heritage only when it naturally fits.`
      : `请把小学生灵感“${idea}”创编成 4 页广西文化文旅绘本；有自然贴合的非遗就介绍，没有就介绍有意义的地方亮点。`;
  return `${brief}\n\n########\n\n${systemPrompt}\n\n${userPrompt}`;
}

function promptOutputFromBook(book: PictureBook) {
  const { id, createdAt, updatedAt, promptRecords, ...draft } = book;
  void id;
  void createdAt;
  void updatedAt;
  void promptRecords;
  return JSON.stringify(draft, null, 2);
}

function withCoreStoryPromptRecord(book: PictureBook, prompt: string, output: string, language: BookLanguage) {
  return {
    ...book,
    promptRecords: book.promptRecords.map((record) =>
      record.type === "story"
        ? {
            ...record,
            label: getCoreStoryPromptLabel(language),
            prompt,
            output
          }
        : record
    )
  };
}

export async function createPictureBookDraft(idea: string, language: BookLanguage = "zh", protagonistGender: ProtagonistGender = "girl") {
  const fallback = createFallbackBook(idea, language, protagonistGender);
  const sceneFirstGuide = buildSceneFirstHeritageGuide(idea, language);
  const systemPrompt =
    language === "en"
      ? [
          "You are the AI creative coach for Guiyun Creator, serving elementary-school students.",
          "Task: Turn a student's one-sentence idea into a Guangxi culture and travel AI picture book.",
          "Perspective: Write from the student's point of view, emphasizing 'I create together with AI'. Do not sound like an adult managing a child.",
          `Student protagonist: use ${protagonistGender === "boy" ? "a boy" : "a girl"} as the story's elementary-school protagonist. ${protagonistVisualSpec("en", protagonistGender)}`,
          "Companion character: whenever the AI helper or robot helper appears in the story, its name must be Gui Xiaoya. Do not write generic names such as AI assistant, AI helper, assistant, or Xiaoyuan.",
          "Gui Xiaoya is a robot companion. Describe its round mechanical hands, glowing screen face, and white-blue body; never give it furry hands, paws, animal fur, or plush-animal body parts.",
          "Content: Combine Guangxi travel scenes, local culture, nature, food, daily life, and creative-writing growth. Use intangible heritage only when it naturally fits the scene.",
          sceneFirstGuide,
          "Fidelity rule: Preserve the student's named place, activity, object, food, animal, and mood. If the idea mentions Sanniang Bay, dolphins, crabs, beach barbecue, or another concrete detail, those details must drive the plot and must not be replaced by another Guangxi place.",
          "Storyboard must stay centered on the preferred elements above. Do not suddenly switch to other famous Guangxi places or symbols unless the student idea mentions them.",
          "Do not add Sanyuesan, song fairs, mountain songs, embroidered balls, Liu Sanjie, Zhuang brocade, or bronze drums unless those words or a clearly related scene appears in the student idea.",
          "Each page must show concrete place, action, and cultural detail. Avoid vague wording such as only saying heritage, tradition, or secret.",
          "Safety: Suitable for ages 6-12. Avoid danger, horror, adult content, ads, or invented policy claims.",
          "Language: All reader-facing story fields must be in natural English. Guangxi names may keep Chinese proper nouns with simple English explanation when useful.",
          "Output: JSON only. No Markdown, no extra explanation."
        ].join("\n")
      : [
          "你是“桂韵创想家”的 AI 创编导师，服务对象是小学组学生。",
          "任务：根据学生的一句话灵感，生成广西文化文旅 AI 绘本。",
          "视角：必须使用学生视角，强调“我和 AI 一起创作”，不要写成成人管理孩子。",
          `小学生主角：故事主角必须是${protagonistGender === "boy" ? "男孩" : "女孩"}。${protagonistVisualSpec("zh", protagonistGender)}`,
          "伙伴角色：如果故事里出现帮助我的 AI 或机器人助手，名字必须是“桂小雅”，不要写“AI小助手”“AI助手”“小助手”“小圆”。",
          "桂小雅是机器人伙伴，可以描写圆圆的机械手、发光屏幕脸和白蓝机身；不要写毛茸茸的小手、爪子、动物绒毛或毛绒动物身体。",
          "内容：融合广西文旅场景、地方文化、自然风景、美食物产、日常生活和创编能力训练；只有自然贴合时才使用非遗。",
          sceneFirstGuide,
          "忠实原则：必须保留学生灵感里的具体地点、活动、物件、食物、动物和情绪。如果灵感写了三娘湾、海豚、螃蟹、海边烧烤等具体内容，这些内容必须推动故事，不能改写成百色、芒果园或其他无关广西地点。",
          "4 页分镜必须围绕上面“本次灵感优先考虑”的元素推进，不要突然跳到其他知名广西地点或符号。",
          "不要主动添加三月三、歌圩、山歌、绣球、刘三姐、壮锦、铜鼓，除非学生灵感明确出现这些词或高度相关场景。",
          "每页必须有具体地点、人物动作和文化细节，避免只写“非遗文化”“传统技艺”“秘密”这类空泛表达。",
          "安全：适合 6-12 岁儿童，不出现危险、恐怖、成人化、商业广告或编造政策内容。",
          "语言：所有面向读者的故事字段必须使用自然中文；pages[].imagePrompt 的字段值也必须使用简体中文，JSON 字段名除外。",
          "中文图片提示词硬性规则：imagePrompt 字段值不得出现英文单词、英文字母、英文短语或中英双语句子。",
          "输出：只输出 JSON，不要解释，不要 Markdown。"
        ].join("\n");

  const userPrompt =
    language === "en"
      ? [
          `Student idea: ${idea}`,
          "Generate one JSON object. Required fields:",
          "title: picture book title in English",
          "subtitle: one short subtitle in English",
          "originalIdea: original idea",
          "language: exactly \"en\"",
          `protagonistGender: exactly "${protagonistGender}"`,
          `The elementary-school protagonist must be ${protagonistGender === "boy" ? "a boy" : "a girl"} throughout story text and image prompts.`,
          "If a helper robot appears in the story, call it Gui Xiaoya every time.",
          "heritageElements: 2-5 scene-matched Guangxi cultural highlights. They may be intangible heritage, local scenery, agriculture, food, ecology, architecture, city memory, or daily life. Prefer fewer accurate highlights over many famous but unrelated symbols.",
          "tourismElements: 2-5 Guangxi cultural tourism elements",
          "guidingQuestions: 2-3 questions that help the student continue creating, in English",
          "outline: story outline within 55 English words",
          "pages: an array of exactly 4 pages. Each page includes pageNumber, title, text, imagePrompt, cultureNote",
          "Each page text should target 70-100 English words, child-friendly and easy to read aloud. The full book should feel like a rich picture-book read-aloud story, not a short outline.",
          "Each page should be storyboard-ready: one clear visual moment, one action, and one concrete Guangxi detail.",
          "Each cultureNote must read like a child-friendly mini encyclopedia card, 28-45 English words. Explain what the page's Guangxi culture/place/ecology/food/craft/custom is, where it comes from or how it works, and why it is worth knowing. Prefer intangible heritage introductions when they naturally fit, but do not call ordinary scenery or animals intangible heritage.",
          "Every cultural highlight must have a story reason: place, festival, food, sound, character action, nature, or local life. Do not insert Zhuang brocade or bronze drums unless the student idea or chosen scene supports them.",
          "tourGuideScript: a cultural tourism guide script within 90 English words, suitable for an elementary-school student to read aloud",
          "studentReflection: student reflection within 45 English words",
          "aiContentRatio: number from 80 to 95",
          "Image prompts should be in English or bilingual, suitable for children's picture books, watercolor or new-Chinese illustration style, with clear scene-matched Guangxi cultural elements.",
          "Every image prompt must explicitly forbid readable text: no Chinese characters, English letters, pinyin, numbers, captions, dialogue bubbles, labels, signs, plaques, banners, page numbers, subtitles, watermarks, logos, UI, book text, paper notes, museum panels, monuments, or inscriptions. If a sign, plaque, book, paper, banner, monument, or display board appears, render it blank or unreadable.",
          "Image prompts must not ask the image model to draw story paragraphs, page titles, explanations, labels, or cultural notes inside the picture.",
          `Image prompts must keep this student protagonist visual: ${protagonistVisualSpec("en", protagonistGender)}`,
          `Image prompts must use this exact companion role when Gui Xiaoya appears: ${guiXiaolingVisualSpec("en")}`,
          "The 4 image prompts must keep the same elementary-school protagonist, same outfit, same visual style, and continuous story mood. Only the scene and action change per page."
        ].join("\n")
      : [
          `学生灵感：${idea}`,
          "请生成一个 JSON 对象，字段必须包含：",
          "title: 绘本标题",
          "subtitle: 一句副标题",
          "originalIdea: 原始灵感",
          "language: 固定为 \"zh\"",
          `protagonistGender: 固定为 "${protagonistGender}"`,
          `故事正文和图片提示词中的小学生主角必须始终是${protagonistGender === "boy" ? "男孩" : "女孩"}。`,
          "如果故事里出现帮助我的机器人或 AI 伙伴，请每次都称呼它为“桂小雅”。",
          "heritageElements: 2-5 个与场景贴合的广西文化亮点。可以是非遗，也可以是地方风景、物产农耕、美食、生态、建筑、城市记忆或日常生活。宁可少而准确，不要堆砌知名但无关的符号。",
          "tourismElements: 2-5 个广西文旅元素",
          "guidingQuestions: 2-3 个用于启发学生继续创编的问题",
          "outline: 80 字以内故事大纲",
          "pages: 4 页数组，每页包含 pageNumber, title, text, imagePrompt, cultureNote",
          "imagePrompt: 字段名固定为 imagePrompt；字段值必须是全中文图片提示词，只能用简体中文描述画面，不要写 Children's book illustration、watercolor style、No text、No letters、No watermarks 等英文短语，也不要写中英双语。",
          "每页正文以 140-180 个中文字为目标，尽量不要超过 190 字；整本要像真正绘本朗读故事，不要缩水成一句提纲，也不要只写说明文字。",
          "每页正文要适合直接画成插图：一个清楚画面、一个动作、一个具体广西细节。",
          "每页 cultureNote 必须写成儿童版“小百科”卡片，45-70 个中文字。要介绍当前页最贴合的广西文化、非遗、地点、物产、生态或习俗：它是什么、来自哪里或怎么做、为什么值得知道。自然贴合时优先介绍非遗；如果只是动物、风景或城市记忆，不要硬说成非遗。",
          "每个文化亮点都必须有故事理由：地点、节日、食物、声音、人物行动、自然观察或当地生活。不要为了“广西感”强行加入壮锦或铜鼓，除非学生灵感或场景自然支持。",
          "tourGuideScript: 小学生能朗读的 120 字以内文旅讲解词",
          "studentReflection: 60 字以内学生创作反思",
          "aiContentRatio: 80 到 95 的数字",
          "图片提示词要适合儿童绘本、水彩或国潮插画风格，明确与当前场景贴合的广西文化元素。",
          "每页图片提示词必须明确禁止可读文字：不要汉字、英文、拼音、数字、字幕、对白气泡、标签、招牌、牌匾、横幅、页码、水印、标识、界面文字、书页文字、纸条、展板、纪念碑文字或题字；如果场景出现招牌、牌匾、书本、纸张、横幅、纪念碑或展板，只能画成空白或不可读纹理。",
          "图片提示词不得要求模型把故事正文、页标题、说明文字、文化小知识或标签画进图片里。",
          `图片提示词必须保持这个小学生主角设定：${protagonistVisualSpec("zh", protagonistGender)}`,
          `图片提示词必须使用这个画册机器人角色设定：${guiXiaolingVisualSpec("zh")}`,
          "4 页图片提示词必须保持同一位小学生主角、同一套服装、同一绘本画风和连续故事氛围，只改变每页场景与动作。"
        ].join("\n");
  const coreStoryPrompt = buildCoreStoryPromptRecord(idea, systemPrompt, userPrompt, language);

  if (!hasBailianKey()) {
    return withCoreStoryPromptRecord(fallback, coreStoryPrompt, promptOutputFromBook(fallback), language);
  }

  try {
    const content = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], { maxTokens: storyTextMaxTokens(), model: storyTextModel(), temperature: 0.72, timeoutMs: storyTextTimeoutMs() });
    const normalized = normalizeDraft(idea, extractJson(content), language, protagonistGender);
    if (draftHasThinOrBrokenPages(normalized, language)) {
      throw new Error("草稿页数、篇幅或文本完整性不足，已切换为更完整的应景草稿。");
    }
    if (!draftKeepsCoreIdea(normalized, idea) || draftHasUnrelatedSceneDrift(normalized, idea)) {
      throw new Error("草稿偏离了学生原始灵感，已切换为更贴合的应景草稿。");
    }
    if (draftHasUnsupportedDefaultSignals(normalized, idea)) {
      throw new Error("AI 草稿加入了与灵感不匹配的默认广西符号，已切换为应景草稿。");
    }
    const timestamp = nowIso();
    return {
      ...normalized,
      id: fallback.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      promptRecords: [
        makePromptRecord(
          "story",
          getCoreStoryPromptLabel(language),
          coreStoryPrompt,
          JSON.stringify(normalized, null, 2)
        ),
        ...normalized.pages.map((page) =>
          makePromptRecord(
            "image",
            language === "en" ? `Page ${page.pageNumber} Image Prompt` : `第 ${page.pageNumber} 页图片提示词`,
            page.imagePrompt,
            language === "en" ? "Waiting for image generation." : "等待图片生成。"
          )
        )
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "百炼文本生成失败";
    const fallbackWithCorePrompt = withCoreStoryPromptRecord(fallback, coreStoryPrompt, promptOutputFromBook(fallback), language);
    fallbackWithCorePrompt.promptRecords.unshift(makePromptRecord("system", "百炼文本生成失败，使用本地演示数据", coreStoryPrompt, message));
    return fallbackWithCorePrompt;
  }
}

async function createPlaceholderImage(book: PictureBook, page: PictureBookPage) {
  await mkdir(generatedDir, { recursive: true });
  const fileName = `${book.id}-page-${page.pageNumber}-placeholder.svg`;
  const filePath = join(generatedDir, fileName);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900" viewBox="0 0 1280 900">
  <defs>
    <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8efd2"/>
      <stop offset="0.55" stop-color="#d8f1e7"/>
      <stop offset="1" stop-color="#f3d7c5"/>
    </linearGradient>
    <pattern id="zhuang" width="84" height="84" patternUnits="userSpaceOnUse">
      <path d="M0 42h84M42 0v84M14 14l56 56M70 14 14 70" stroke="#c24735" stroke-width="4" opacity=".22"/>
    </pattern>
  </defs>
  <rect width="1280" height="900" fill="url(#sky)"/>
  <rect x="0" y="0" width="1280" height="900" fill="url(#zhuang)" opacity=".36"/>
  <path d="M0 695 C190 590 300 690 448 600 C620 496 740 660 910 548 C1058 450 1150 560 1280 486 L1280 900 L0 900 Z" fill="#5ab59a" opacity=".65"/>
  <path d="M0 750 C210 650 330 760 520 665 C700 575 820 730 1010 615 C1136 540 1210 610 1280 575 L1280 900 L0 900 Z" fill="#1f7c6a" opacity=".62"/>
  <circle cx="1010" cy="190" r="96" fill="#f7c64e" opacity=".86"/>
  <g transform="translate(676 170)" opacity=".9">
    <path d="M0 118 C96 44 188 52 278 110 C350 156 424 154 502 94 L502 300 L0 300 Z" fill="#fffaf0" opacity=".62"/>
    <circle cx="82" cy="98" r="34" fill="#e9a83d" opacity=".7"/>
    <circle cx="156" cy="78" r="18" fill="#c24735" opacity=".42"/>
    <circle cx="248" cy="118" r="28" fill="#3e9b7c" opacity=".55"/>
    <path d="M70 205 Q140 142 214 205 T362 205" fill="none" stroke="#2f785a" stroke-width="16" stroke-linecap="round" opacity=".55"/>
    <path d="M98 258 Q178 206 258 258 T430 258" fill="none" stroke="#c24735" stroke-width="13" stroke-linecap="round" opacity=".34"/>
    <rect x="314" y="56" width="110" height="130" rx="18" fill="#fff3cf" stroke="#8fbf9f" stroke-width="6" opacity=".76"/>
    <path d="M342 84 h54M342 112 h54M342 140 h54" stroke="#8fbf9f" stroke-width="9" stroke-linecap="round" opacity=".5"/>
  </g>
  <g transform="translate(170 245)">
    <circle cx="132" cy="124" r="82" fill="#fffaf0" stroke="#23343a" stroke-width="8"/>
    <circle cx="104" cy="112" r="11" fill="#23343a"/>
    <circle cx="160" cy="112" r="11" fill="#23343a"/>
    <path d="M104 152 Q132 180 164 152" fill="none" stroke="#23343a" stroke-width="9" stroke-linecap="round"/>
    <rect x="62" y="222" width="140" height="182" rx="50" fill="#fffaf0" stroke="#23343a" stroke-width="8"/>
    <path d="M32 275 Q0 330 52 360" fill="none" stroke="#c24735" stroke-width="20" stroke-linecap="round"/>
    <path d="M230 275 Q276 318 232 370" fill="none" stroke="#c24735" stroke-width="20" stroke-linecap="round"/>
    <path d="M98 274 h68 l-34 48 z" fill="#e8a83b"/>
  </g>
  <g transform="translate(548 254)" opacity=".94">
    <rect x="0" y="0" width="530" height="322" rx="28" fill="#fffaf0"/>
    <path d="M50 120 C118 34 210 64 260 132 C318 210 398 148 478 78" fill="none" stroke="#5ab59a" stroke-width="22" stroke-linecap="round" opacity=".42"/>
    <path d="M56 216 C130 166 204 172 268 226 C334 282 414 266 478 202" fill="none" stroke="#f0ba49" stroke-width="20" stroke-linecap="round" opacity=".52"/>
    <circle cx="112" cy="92" r="38" fill="#c24735" opacity=".18"/>
    <circle cx="248" cy="166" r="52" fill="#3e9b7c" opacity=".18"/>
    <circle cx="400" cy="112" r="34" fill="#e8a83b" opacity=".3"/>
    <path d="M86 268 h360" stroke="#23343a" stroke-width="10" stroke-linecap="round" opacity=".08"/>
  </g>
</svg>`;
  await writeFile(filePath, svg, "utf8");
  return `/generated/${fileName}`;
}

async function removePreviousGeneratedPageImages(bookId: string, pageNumber: number) {
  await Promise.all(
    ["png", "jpg", "jpeg", "webp"].map((ext) =>
      rm(join(generatedDir, `${bookId}-page-${pageNumber}.${ext}`), { force: true })
    )
  );
}

async function optimizeGeneratedImage(bytes: Buffer) {
  const maxBytes = generatedImageMaxBytes();
  const maxSide = Math.max(512, Math.round(generatedImageMaxSide()));
  const minSide = Math.min(768, maxSide);
  let quality = generatedImageJpegQuality();
  let side = maxSide;

  while (true) {
    const output = await sharp(bytes)
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    if (output.length <= maxBytes || (quality <= 68 && side <= minSide)) {
      return output;
    }
    if (quality > 68) {
      quality -= 6;
    } else {
      side = Math.max(minSide, Math.round(side * 0.85));
    }
  }
}

async function downloadGeneratedImage(url: string, bookId: string, pageNumber: number) {
  await mkdir(generatedDir, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const optimizedBytes = await optimizeGeneratedImage(bytes);
  const fileName = `${bookId}-page-${pageNumber}.jpg`;
  await removePreviousGeneratedPageImages(bookId, pageNumber);
  await writeFile(join(generatedDir, fileName), optimizedBytes);
  return `/generated/${fileName}`;
}

async function callBailianImage(prompt: string, bookId: string, pageNumber: number) {
  if (!dashScopeKey()) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dashScopeKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: imageModel(),
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: prompt }]
          }
        ]
      },
      parameters: {
        size: imageSize(),
        n: 1,
        watermark: false
      }
    })
  });

  const payload = (await response.json().catch(() => null)) as {
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }>; results?: Array<{ url?: string }> };
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.message || `Bailian image request failed with HTTP ${response.status}`);
  }

  const imageUrl =
    payload?.output?.results?.[0]?.url ||
    payload?.output?.choices?.[0]?.message?.content?.find((item) => item.image || item.url)?.image ||
    payload?.output?.choices?.[0]?.message?.content?.find((item) => item.image || item.url)?.url;

  if (!imageUrl) {
    throw new Error("Bailian image model returned no image URL");
  }

  return downloadGeneratedImage(imageUrl, bookId, pageNumber);
}

function cleanPageImagePrompt(prompt = "") {
  const marker = "当前页原始图片 Prompt：";
  const markerIndex = prompt.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return prompt.slice(markerIndex + marker.length).trim();
  }

  return prompt.trim();
}

function visualOnlyPrompt(prompt = "") {
  return cleanPageImagePrompt(prompt)
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter((line) => line && !/cultureNote|文化提示|小百科|小发现|正文|Story scene|Page theme|页面主题|故事画面/iu.test(line))
    .join("\n")
    .trim();
}

function buildCoherentImagePrompt(book: PictureBook, page: PictureBookPage) {
  const protagonistGender = book.protagonistGender || "girl";
  const context = book.pages
    .map((item) => `第${item.pageNumber}页`)
    .join("、");
  const pageVisualPrompt = visualOnlyPrompt(page.imagePrompt);
  return [
    "请生成一张高质量儿童绘本插图，必须与同一本绘本的其他页保持连贯。",
    "画面格式硬性要求：只生成当前页的一张完整单幅插图。不要四宫格、不要漫画分镜、不要拼贴、多窗格、多张小图或缩略图合集。",
    "内容范围硬性要求：画面只表现当前页故事的一个关键瞬间，不要把第1页、第2页、第3页、第4页同时画在同一张图里。",
    "角色数量硬性要求：画面中只出现一位小学生主角和一个桂小雅机器人，不要重复主角，不要重复桂小雅，不要出现第二个相同小朋友。",
    `统一视觉设定：同一位小学生主角贯穿四页。${protagonistVisualSpec(book.language || "zh", protagonistGender)}`,
    `统一伙伴角色设定：每页都让桂小雅作为画册机器人小伙伴自然出现在画面中。${guiXiaolingVisualSpec(book.language || "zh")}`,
    "统一画风：温暖明亮的儿童绘本插画，细腻水彩质感，柔和光线，广西民族纹样可以作为小面积装饰，画面适合小学组展示。",
    "文化呈现原则：只画当前页视觉提示和文化元素里自然出现的内容；有非遗就自然表现，没有非遗就表现风景、物产、农耕、城市生活等有意义内容，不要为了广西感额外加入壮锦、铜鼓或其他无关符号。",
    textFreeImageRule(book.language || "zh"),
    "文字限制硬性要求：故事正文、小百科、文化提示、页标题、标签和讲解词一律不提供给绘图模型，也绝对不能被画进图片。",
    "图像只根据下面的视觉提示、角色设定和文化元素绘制，不要补充任何说明牌、注释、对白、地名、标题或百科文字。",
    "场景物件限制：如果画面中有纪念馆、雕像底座、展板、路牌、门匾、书本、纸张、横幅或屏幕，请保持空白、纯色、图案纹理或不可读模糊纹理。",
    "统一限制：不要出现真实人物肖像；不要改变主角长相、年龄、服装和整体画风。",
    `全书文化亮点：${book.heritageElements.join("、")}`,
    `全文旅元素：${book.tourismElements.join("、")}`,
    `全书页码仅供角色一致性参考，不要画成分镜：${context}`,
    `当前只绘制第 ${page.pageNumber} 页对应的单个故事画面，不要在画面里写页标题或页码。`,
    "当前页视觉提示，只能当作画面构图参考，不得把其中任何词语画成文字：",
    pageVisualPrompt || "小学生主角和桂小雅在广西场景中观察、体验和创作，画面表现一个清楚动作和一个地方文化细节。",
    "最终自检：整张图中不得出现任何可读字符，包括中文、拼音、英文、数字和标点。"
  ].join("\n");
}

export async function generatePageImage(book: PictureBook, pageNumber: number) {
  const page = book.pages.find((item) => item.pageNumber === pageNumber) || book.pages[0];
  if (!page) {
    throw new Error("Picture book has no pages");
  }

  let imageUrl = "";
  let imageSource: PictureBookPage["imageSource"] = "placeholder";
  let record: PromptRecord;
  const coherentPrompt = buildCoherentImagePrompt(book, page);

  try {
    imageUrl = await callBailianImage(coherentPrompt, book.id, page.pageNumber);
    imageSource = "bailian";
    record = makePromptRecord("image", `第 ${page.pageNumber} 页百炼图片生成（连贯角色设定）`, coherentPrompt, imageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片生成失败";
    imageUrl = await createPlaceholderImage(book, page);
    imageSource = "placeholder";
    record = makePromptRecord("image", `第 ${page.pageNumber} 页本地演示插图`, coherentPrompt, message);
  }

  const nextPage: PictureBookPage = {
    ...page,
    imagePrompt: coherentPrompt,
    imageUrl,
    imageSource
  };

  return { page: nextPage, record };
}

export async function generateAllPageImages(book: PictureBook) {
  const results = await Promise.all(book.pages.map((page) => generatePageImage(book, page.pageNumber)));
  return {
    pages: book.pages.map((page) => results.find((result) => result.page.pageNumber === page.pageNumber)?.page || page),
    records: results.map((result) => result.record)
  };
}
