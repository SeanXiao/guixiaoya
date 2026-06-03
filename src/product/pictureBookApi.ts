import type { BookLanguage, PictureBook, PictureBookSummary, ProtagonistGender } from "./types";

type BookListResponse = {
  books?: PictureBookSummary[];
};

type BookResponse = BookListResponse & {
  book?: PictureBook;
  error?: string;
};

type SpeechResponse = {
  audioUrl?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error || "请求失败");
  }
  if (!data) {
    throw new Error("服务返回内容为空");
  }
  return data;
}

export async function listPictureBooks() {
  const response = await fetch("/api/picture-books");
  const data = await readJson<BookListResponse>(response);
  return data.books || [];
}

export async function getPictureBook(id: string) {
  const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`);
  const data = await readJson<BookResponse>(response);
  if (!data.book) {
    throw new Error("绘本不存在");
  }
  return data.book;
}

export async function createPictureBookDraft(payload: {
  idea: string;
  language: BookLanguage;
  protagonistGender: ProtagonistGender;
}) {
  const response = await fetch("/api/picture-books/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, generateImage: false })
  });
  const data = await readJson<BookResponse>(response);
  if (!data.book) {
    throw new Error("绘本制作失败");
  }
  return {
    book: data.book,
    books: data.books || []
  };
}

export async function generatePictureBookPageImage(bookId: string, pageNumber: number) {
  const response = await fetch(`/api/picture-books/${encodeURIComponent(bookId)}/pages/${pageNumber}/image`, {
    method: "POST"
  });
  const data = await readJson<BookResponse>(response);
  if (!data.book) {
    throw new Error("插图暂时没画好");
  }
  return data.book;
}

export async function preloadPictureBookSpeech(bookId: string) {
  const response = await fetch(`/api/picture-books/${encodeURIComponent(bookId)}/speech/preload`, { method: "POST" });
  const data = await readJson<BookResponse>(response);
  return {
    book: data.book || null,
    books: data.books || []
  };
}

export async function deletePictureBook(id: string, deletePassword: string) {
  const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deletePassword })
  });
  const data = await readJson<BookListResponse>(response);
  return data.books || [];
}

export async function synthesizePictureBookSpeech(text: string, protagonistGender: ProtagonistGender, language: BookLanguage) {
  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, protagonistGender, language })
  });
  const data = await readJson<SpeechResponse>(response);
  if (!data.audioUrl) {
    throw new Error("朗读音频生成失败");
  }
  return data.audioUrl;
}
