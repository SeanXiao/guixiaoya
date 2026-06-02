import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPictureBookDraft,
  generateAllPageImages,
  generatePageImage,
  generateSeasonalInspirationChips,
  getBailianRuntimeStatus
} from "./bailian.js";
import { getBailianTtsVoice, synthesizeBailianSpeech } from "./bailianTts.js";
import {
  deleteBook,
  getBook,
  listBookSummaries,
  saveBook,
  toBookSummary,
  updateBook,
  type PictureBook,
  type PictureBookPage
} from "./bookStore.js";

const app = express();
const port = Number.parseInt(process.env.PORT || "8787", 10);
const host = process.env.HOST || "127.0.0.1";
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

app.use(express.json({ limit: "1mb" }));
app.use("/generated", express.static(join(rootDir, "data", "generated")));

// Static dir config saved for later (SPA fallback must come AFTER all API routes)
const staticDir = process.env.STATIC_DIR || join(rootDir, "dist");
let spaHtml: string | null = null;
try {
  if (readFileSync(join(staticDir, "index.html"), "utf-8")) {
    app.use("/assets", express.static(join(staticDir, "assets")));
    spaHtml = readFileSync(join(staticDir, "index.html"), "utf-8");
    console.log(`Static files served from ${staticDir}`);
  }
} catch { /* static dir not found, skip (API-only mode) */ }

function cleanSpeechPart(text: string) {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。！？!?.,，、；;：:]+$/gu, "");
}

function buildPageSpeechText(book: PictureBook, page: PictureBookPage, includeCultureNote = true) {
  const language = book.language || "zh";
  const parts = [page.title, page.text, includeCultureNote ? page.cultureNote : ""]
    .map(cleanSpeechPart)
    .filter(Boolean);
  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

async function preloadPictureBookSpeech(book: PictureBook) {
  const language = book.language || "zh";
  const protagonistGender = book.protagonistGender || "girl";
  const expectedVoice = getBailianTtsVoice(protagonistGender, language);
  const titleText = cleanSpeechPart(book.title);
  const titleWarmup = titleText
    ? synthesizeBailianSpeech(titleText, protagonistGender, language).catch(() => null)
    : Promise.resolve(null);

  const pageResults = await Promise.allSettled(
    book.pages.map(async (page) => {
      const speechAudioText = buildPageSpeechText(book, page, true);
      const hasCurrentVoice = page.speechAudioVoice === expectedVoice && page.speechAudioLanguage === language;
      const canReuseLegacyChineseVoice = language === "zh" && !page.speechAudioVoice && !page.speechAudioLanguage;
      if (page.speechAudioUrl && page.speechAudioText === speechAudioText && (hasCurrentVoice || canReuseLegacyChineseVoice)) {
        return {
          pageNumber: page.pageNumber,
          speechAudioText,
          speechAudioUrl: page.speechAudioUrl,
          speechAudioVoice: page.speechAudioVoice || expectedVoice,
          speechAudioLanguage: page.speechAudioLanguage || language
        };
      }

      const audio = await synthesizeBailianSpeech(speechAudioText, protagonistGender, language);
      return {
        pageNumber: page.pageNumber,
        speechAudioText,
        speechAudioUrl: audio.audioUrl,
        speechAudioVoice: audio.voice,
        speechAudioLanguage: language
      };
    })
  );
  await titleWarmup;

  const speechByPage = new Map(
    pageResults
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          pageNumber: number;
          speechAudioText: string;
          speechAudioUrl: string;
          speechAudioVoice: string;
          speechAudioLanguage: NonNullable<PictureBook["language"]>;
        }> => result.status === "fulfilled"
      )
      .map((result) => [result.value.pageNumber, result.value])
  );

  if (!speechByPage.size) {
    return book;
  }

  return (
    (await updateBook(book.id, (currentBook) => ({
      ...currentBook,
      pages: currentBook.pages.map((page) => {
        const speech = speechByPage.get(page.pageNumber);
        return speech
            ? {
                ...page,
                speechAudioText: speech.speechAudioText,
                speechAudioUrl: speech.speechAudioUrl,
                speechAudioVoice: speech.speechAudioVoice,
                speechAudioLanguage: speech.speechAudioLanguage
              }
          : page;
      })
    }))) || book
  );
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "guiyun-creative-picture-book" });
});

app.get("/api/bailian/status", (_request, response) => {
  response.json(getBailianRuntimeStatus());
});

app.post("/api/speech", async (request, response, next) => {
  try {
    const text = String(request.body?.text || "").trim();
    const protagonistGender = request.body?.protagonistGender === "boy" ? "boy" : "girl";
    const language = request.body?.language === "en" ? "en" : "zh";
    if (!text) {
      response.status(400).json({ error: "text is required" });
      return;
    }

    const audio = await synthesizeBailianSpeech(text, protagonistGender, language);
    response.json(audio);
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration-chips", async (request, response, next) => {
  try {
    const language = request.body?.language === "en" ? "en" : "zh";
    const currentIdea = String(request.body?.currentIdea || "").trim().slice(0, 120);
    const currentDate = String(request.body?.currentDate || "").trim();
    const randomSeed = String(request.body?.randomSeed || "").trim().slice(0, 80);
    const refreshCount = Number(request.body?.refreshCount || 1);
    const existingChips = Array.isArray(request.body?.existingChips)
      ? request.body.existingChips.map((chip: unknown) => String(chip || "").trim()).filter(Boolean).slice(0, 12)
      : [];
    const result = await generateSeasonalInspirationChips({ currentDate, currentIdea, existingChips, language, randomSeed, refreshCount });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/picture-books", async (_request, response, next) => {
  try {
    response.json({ books: await listBookSummaries() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/picture-books/:id", async (request, response, next) => {
  try {
    const book = await getBook(request.params.id);
    if (!book) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }
    response.json({ book });
  } catch (error) {
    next(error);
  }
});

app.post("/api/picture-books/generate", async (request, response, next) => {
  try {
    const idea = String(request.body?.idea || "").trim();
    const language = request.body?.language === "en" ? "en" : "zh";
    const protagonistGender = request.body?.protagonistGender === "boy" ? "boy" : "girl";
    const shouldGenerateImage = request.body?.generateImage !== false;
    if (!idea) {
      response.status(400).json({ error: "idea is required" });
      return;
    }

    let book = await createPictureBookDraft(idea, language, protagonistGender);
    if (shouldGenerateImage) {
      const result = await generateAllPageImages(book);
      book = {
        ...book,
        pages: result.pages,
        promptRecords: book.promptRecords.concat(result.records)
      };
    }

    const savedBook = await saveBook(book);
    response.json({ book: savedBook, summary: toBookSummary(savedBook), books: await listBookSummaries() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/picture-books/:id/speech/preload", async (request, response, next) => {
  try {
    const book = await getBook(request.params.id);
    if (!book) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }

    const nextBook = await preloadPictureBookSpeech(book);
    response.json({ book: nextBook, books: await listBookSummaries() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/picture-books/:id/pages/:pageNumber/image", async (request, response, next) => {
  try {
    const book = await getBook(request.params.id);
    if (!book) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }

    const pageNumber = Number(request.params.pageNumber);
    const result = await generatePageImage(book, pageNumber);
    const nextBook = await updateBook(book.id, (currentBook) => {
      return {
        ...currentBook,
        pages: currentBook.pages.map((page) =>
          page.pageNumber === result.page.pageNumber
            ? {
                ...result.page,
                speechAudioText: page.speechAudioText || result.page.speechAudioText,
                speechAudioUrl: page.speechAudioUrl || result.page.speechAudioUrl,
                speechAudioVoice: page.speechAudioVoice || result.page.speechAudioVoice,
                speechAudioLanguage: page.speechAudioLanguage || result.page.speechAudioLanguage
              }
            : page
        ),
        promptRecords: currentBook.promptRecords.concat(result.record)
      };
    });
    if (!nextBook) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }

    response.json({ book: nextBook, page: result.page });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/picture-books/:id", async (request, response, next) => {
  try {
    const deleted = await deleteBook(request.params.id);
    response.json({ ok: true, deleted, books: await listBookSummaries() });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "not found" });
});

// SPA fallback — must be AFTER all API routes so it only catches non-API requests
if (spaHtml) {
  app.get("/", (_req, res) => res.status(200).type("html").send(spaHtml));
  app.get("/{*any}", (_req, res) => res.status(200).type("html").send(spaHtml));
}

// Prevent silent crashes from unhandled rejections
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  console.error("API Error:", message);
  response.status(500).json({ error: message });
});

const server = app.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`API server listening on http://${displayHost}:${port}`);
});

let isShuttingDown = false;

server.on("error", (error) => {
  console.error("Server error:", error instanceof Error ? error.message : error);
  process.exit(1);
});

function shutdown(signal: string, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(exitCode));
  setTimeout(() => process.exit(exitCode), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason instanceof Error ? reason.message : reason);
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error.message);
  shutdown("uncaughtException", 1);
});
