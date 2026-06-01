import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type MemoryFact = {
  id: string;
  text: string;
  createdAt: string;
  lastMentionedAt: string;
  source: string;
};

export type MemoryState = {
  facts: MemoryFact[];
};

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const memoryPath = join(rootDir, "data", "memory.json");

const sensitiveWords = [
  "密码",
  "身份证",
  "银行卡",
  "手机号",
  "电话",
  "住址",
  "地址",
  "门牌"
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeFact(text: string) {
  return text.replace(/\s+/g, " ").replace(/[。！？!?，,；;：:]+$/u, "").trim();
}

function isSafeToStore(text: string) {
  return text.length >= 3 && !sensitiveWords.some((word) => text.includes(word));
}

function makeId(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `mem_${hash.toString(16)}`;
}

async function ensureDataDir() {
  await mkdir(dirname(memoryPath), { recursive: true });
}

export async function loadMemory(): Promise<MemoryState> {
  await ensureDataDir();
  try {
    const raw = await readFile(memoryPath, "utf8");
    const parsed = JSON.parse(raw) as MemoryState;
    return { facts: Array.isArray(parsed.facts) ? parsed.facts : [] };
  } catch {
    return { facts: [] };
  }
}

export async function saveMemory(memory: MemoryState) {
  await ensureDataDir();
  await writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
}

export async function rememberFacts(facts: string[], source: string) {
  const memory = await loadMemory();
  const stored: MemoryFact[] = [];
  const timestamp = nowIso();

  for (const fact of facts.map(normalizeFact).filter(isSafeToStore)) {
    const existing = memory.facts.find((item) => item.text === fact);
    if (existing) {
      existing.lastMentionedAt = timestamp;
      stored.push(existing);
      continue;
    }

    const nextFact = {
      id: makeId(fact),
      text: fact,
      createdAt: timestamp,
      lastMentionedAt: timestamp,
      source
    };
    memory.facts.unshift(nextFact);
    stored.push(nextFact);
  }

  memory.facts = memory.facts.slice(0, 24);
  await saveMemory(memory);
  return stored;
}

function cleanCapture(value = "") {
  return value
    .replace(/^(是|叫|为)/u, "")
    .replace(/[。！？!?，,；;：:\n].*$/u, "")
    .trim();
}

export function extractMemoriesFromText(text: string) {
  const compact = text.replace(/\s+/g, "");
  const facts = new Set<string>();

  const nameMatch = compact.match(/(?:我叫|我的名字叫|我的名字是)([\u4e00-\u9fa5A-Za-z0-9_·]{1,16})/u);
  if (nameMatch?.[1]) {
    facts.add(`用户名字是${cleanCapture(nameMatch[1])}`);
  }

  const likeMatch = text.match(/我喜欢([^。！？!?，,；;\n]{1,40})/u);
  if (likeMatch?.[1]) {
    facts.add(`用户喜欢${cleanCapture(likeMatch[1])}`);
  }

  const dislikeMatch = text.match(/我不喜欢([^。！？!?，,；;\n]{1,40})/u);
  if (dislikeMatch?.[1]) {
    facts.add(`用户不喜欢${cleanCapture(dislikeMatch[1])}`);
  }

  const rememberMatch = text.match(/(?:请记住|帮我记住|你要记住|记住)[：:，, ]?([^。！？!?\n]{2,80})/u);
  if (rememberMatch?.[1]) {
    const remembered = cleanCapture(rememberMatch[1]).replace(/^我今天/u, "用户今天");
    facts.add(remembered);
  }

  const relationMatch = text.match(/我的(爸爸|妈妈|老师|朋友|宠物|学校|班级)(?:叫|是)([^。！？!?，,；;\n]{1,30})/u);
  if (relationMatch?.[1] && relationMatch?.[2]) {
    facts.add(`用户的${relationMatch[1]}是${cleanCapture(relationMatch[2])}`);
  }

  const todayMatch = text.match(/我今天([^。！？!?\n]{2,60})/u);
  if (todayMatch?.[1]) {
    facts.add(`用户今天${cleanCapture(todayMatch[1])}`);
  }

  return [...facts].filter((fact) => fact.length >= 3);
}
