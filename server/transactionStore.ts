import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type TransactionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type TransactionRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: TransactionMessage[];
};

export type TransactionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string;
};

type TransactionState = {
  transactions: TransactionRecord[];
};

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const transactionsPath = join(rootDir, "data", "transactions.json");

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(id = "") {
  return id.replace(/[^\w-]/gu, "").slice(0, 80);
}

function makeTransactionId() {
  return `txn_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function makeMessageId(role: TransactionMessage["role"]) {
  return `${role}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function makeTitle(text: string) {
  const normalized = text.replace(/\s+/gu, " ").replace(/[。！？!?，,；;：:]+$/u, "").trim();
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || "新的对话";
}

function summarize(transaction: TransactionRecord): TransactionSummary {
  const lastMessage = transaction.messages.at(-1)?.content || "还没有消息";
  return {
    id: transaction.id,
    title: transaction.title,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    messageCount: transaction.messages.length,
    lastMessage: lastMessage.length > 34 ? `${lastMessage.slice(0, 34)}...` : lastMessage
  };
}

async function ensureDataDir() {
  await mkdir(dirname(transactionsPath), { recursive: true });
}

export async function loadTransactions(): Promise<TransactionState> {
  await ensureDataDir();
  try {
    const raw = await readFile(transactionsPath, "utf8");
    const parsed = JSON.parse(raw) as TransactionState;
    return { transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [] };
  } catch {
    return { transactions: [] };
  }
}

export async function saveTransactions(state: TransactionState) {
  await ensureDataDir();
  await writeFile(transactionsPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function listTransactionSummaries() {
  const state = await loadTransactions();
  return [...state.transactions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(summarize);
}

export async function getTransaction(id: string) {
  const cleanId = normalizeId(id);
  const state = await loadTransactions();
  return state.transactions.find((transaction) => transaction.id === cleanId) || null;
}

export async function createTransaction(id?: string) {
  const state = await loadTransactions();
  const cleanId = normalizeId(id) || makeTransactionId();
  const existing = state.transactions.find((transaction) => transaction.id === cleanId);
  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  const transaction: TransactionRecord = {
    id: cleanId,
    title: "新的对话",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: []
  };

  state.transactions.unshift(transaction);
  await saveTransactions(state);
  return transaction;
}

export async function appendTransactionTurn(id: string, userText: string, assistantText: string) {
  const state = await loadTransactions();
  const cleanId = normalizeId(id) || makeTransactionId();
  const timestamp = nowIso();
  let transaction = state.transactions.find((item) => item.id === cleanId);

  if (!transaction) {
    transaction = {
      id: cleanId,
      title: makeTitle(userText),
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: []
    };
    state.transactions.unshift(transaction);
  }

  if (!transaction.messages.length || transaction.title === "新的对话") {
    transaction.title = makeTitle(userText);
  }

  transaction.messages.push({
    id: makeMessageId("user"),
    role: "user",
    content: userText,
    createdAt: timestamp
  });
  transaction.messages.push({
    id: makeMessageId("assistant"),
    role: "assistant",
    content: assistantText,
    createdAt: nowIso()
  });
  transaction.messages = transaction.messages.slice(-80);
  transaction.updatedAt = nowIso();

  state.transactions = state.transactions
    .filter((item) => item.id !== transaction.id)
    .concat(transaction)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 40);

  await saveTransactions(state);
  return transaction;
}

export async function deleteTransaction(id: string) {
  const cleanId = normalizeId(id);
  const state = await loadTransactions();
  const nextTransactions = state.transactions.filter((transaction) => transaction.id !== cleanId);
  const deleted = nextTransactions.length !== state.transactions.length;
  await saveTransactions({ transactions: nextTransactions });
  return deleted;
}

export function toTransactionSummary(transaction: TransactionRecord) {
  return summarize(transaction);
}
