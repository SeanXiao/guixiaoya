import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PromptRecord = {
  id: string;
  type: "story" | "image" | "culture" | "system";
  label: string;
  prompt: string;
  output: string;
  createdAt: string;
};

export type BookLanguage = "zh" | "en";

export type ProtagonistGender = "girl" | "boy";

export type PictureBookPage = {
  pageNumber: number;
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string;
  imageSource: "bailian" | "placeholder";
  cultureNote: string;
  speechAudioUrl?: string;
  speechAudioText?: string;
  speechAudioVoice?: string;
  speechAudioLanguage?: BookLanguage;
};

export type PictureBook = {
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

export type PictureBookSummary = {
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

type BookState = {
  books: PictureBook[];
};

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const booksPath = join(rootDir, "data", "picture-books.json");

export function nowIso() {
  return new Date().toISOString();
}

export function makeBookId() {
  return `book_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

export function makePromptRecord(type: PromptRecord["type"], label: string, prompt: string, output: string): PromptRecord {
  return {
    id: `prompt_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    type,
    label,
    prompt,
    output,
    createdAt: nowIso()
  };
}

function cleanId(id = "") {
  return id.replace(/[^\w-]/gu, "").slice(0, 80);
}

function summarize(book: PictureBook): PictureBookSummary {
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    updatedAt: book.updatedAt,
    language: book.language || "zh",
    protagonistGender: book.protagonistGender || "girl",
    heritageElements: book.heritageElements,
    tourismElements: book.tourismElements,
    coverImageUrl: book.pages[0]?.imageUrl || ""
  };
}

async function ensureDataDir() {
  await mkdir(dirname(booksPath), { recursive: true });
}

export async function loadBooks(): Promise<BookState> {
  await ensureDataDir();
  try {
    const raw = await readFile(booksPath, "utf8");
    const parsed = JSON.parse(raw) as BookState;
    return { books: Array.isArray(parsed.books) ? parsed.books : [] };
  } catch {
    return { books: [] };
  }
}

export async function saveBooks(state: BookState) {
  await ensureDataDir();
  await writeFile(booksPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function listBookSummaries() {
  const state = await loadBooks();
  return [...state.books].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(summarize);
}

export async function getBook(id: string) {
  const state = await loadBooks();
  const targetId = cleanId(id);
  return state.books.find((book) => book.id === targetId) || null;
}

export async function saveBook(book: PictureBook) {
  const state = await loadBooks();
  const nextBook = { ...book, updatedAt: nowIso() };
  state.books = state.books
    .filter((item) => item.id !== nextBook.id)
    .concat(nextBook)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 40);
  await saveBooks(state);
  return nextBook;
}

let bookUpdateQueue = Promise.resolve();

function enqueueBookUpdate<T>(task: () => Promise<T>) {
  const nextTask = bookUpdateQueue.then(task, task);
  bookUpdateQueue = nextTask.then(
    () => undefined,
    () => undefined
  );
  return nextTask;
}

export async function updateBook(id: string, updater: (book: PictureBook) => PictureBook | Promise<PictureBook>) {
  return enqueueBookUpdate(async () => {
    const state = await loadBooks();
    const targetId = cleanId(id);
    const existingBook = state.books.find((book) => book.id === targetId);
    if (!existingBook) {
      return null;
    }

    const updatedBook = await updater(existingBook);
    const nextBook = {
      ...updatedBook,
      id: existingBook.id,
      createdAt: existingBook.createdAt,
      updatedAt: nowIso()
    };
    state.books = state.books
      .filter((item) => item.id !== nextBook.id)
      .concat(nextBook)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 40);
    await saveBooks(state);
    return nextBook;
  });
}

export async function deleteBook(id: string) {
  const state = await loadBooks();
  const targetId = cleanId(id);
  const nextBooks = state.books.filter((book) => book.id !== targetId);
  const deleted = nextBooks.length !== state.books.length;
  await saveBooks({ books: nextBooks });
  return deleted;
}

export function toBookSummary(book: PictureBook) {
  return summarize(book);
}
