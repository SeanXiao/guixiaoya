import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  Clock,
  Compass,
  Cpu,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Home,
  Image as ImageIcon,
  Info,
  Lightbulb,
  LoaderCircle,
  Mic,
  MicOff,
  Paintbrush,
  Plus,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2
} from "lucide-react";
import companionRobot from "../assets/companion-robot.png";
import {
  createPictureBookDraft,
  deletePictureBook,
  generatePictureBookPageImage,
  getPictureBook,
  listPictureBooks,
  preloadPictureBookSpeech
} from "./pictureBookApi";
import ClassicApp from "../App";
import { bookshelfTitle, companionName, companionSchool, displayBook, displayBookSummary, displayText, productTitle } from "./productCopy";
import { speakProductText, stopProductSpeech } from "./productSpeech";
import type { BookLanguage, PictureBook, PictureBookPage, PictureBookSummary, PromptRecord, ProtagonistGender } from "./types";

type ProductView = "shelf" | "desk" | "detail" | "records" | "theater" | "about";
type ImageTaskStatus = "idle" | "running" | "done" | "error";
type ProductStage = "input" | "analysis" | "content" | "images" | "saved";
type RecordTabKey = "story" | "pages" | "images";
type PromptContentTabKey = "prompt" | "output";
type ReadingMode = "idle" | "page" | "book";

type ProductProgress = {
  active: boolean;
  startedAt: number;
  elapsedSeconds: number;
  stage: ProductStage;
  title: string;
  detail: string;
  imageTasks: Record<number, ImageTaskStatus>;
  logs: string[];
  error?: string;
};

const defaultIdea = "我想做一本我在桂林漓江边遇见壮锦和山歌的绘本。";

const defaultInspirationChips = [
  "小壮壮的漓江之旅",
  "三月三的歌圩和绣球",
  "龙脊梯田里的五色糯米饭",
  "北海银滩上的贝雕剧场",
  "三江风雨桥边的侗族大歌",
  "德天瀑布旁的天琴故事"
];

const emptyImageTasks: Record<number, ImageTaskStatus> = {
  1: "idle",
  2: "idle",
  3: "idle",
  4: "idle"
};

function parseProductRoute(hash = window.location.hash): { view: ProductView; bookId?: string } {
  const cleaned = hash.replace(/^#\/?/u, "");
  const [section, encodedBookId, subview] = cleaned.split("/");
  if (!cleaned || section === "shelf") {
    return { view: "shelf" };
  }
  if (section === "desk") {
    return { view: "desk" };
  }
  if (section === "records") {
    return { view: "records" };
  }
  if (section === "about") {
    return { view: "about" };
  }
  if (section === "theater") {
    return { view: "theater" };
  }
  if (section === "book" && encodedBookId) {
    const bookId = decodeURIComponent(encodedBookId);
    if (subview === "theater") {
      return { view: "theater", bookId };
    }
    if (subview === "records") {
      return { view: "records", bookId };
    }
    return { view: "detail", bookId };
  }
  return { view: "shelf" };
}

function bookRoute(id: string, view: ProductView = "detail") {
  const encodedId = encodeURIComponent(id);
  if (view === "theater") {
    return `#/book/${encodedId}/theater`;
  }
  if (view === "records") {
    return `#/book/${encodedId}/records`;
  }
  return `#/book/${encodedId}`;
}

function formatShelfDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatRecordTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function compactText(text = "", maxLength = 72) {
  const clean = text.replace(/\s+/gu, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function getRecordTypeLabel(type: PromptRecord["type"]) {
  const labels: Record<PromptRecord["type"], string> = {
    story: "故事整理",
    image: "插图灵感",
    culture: "文化小百科",
    system: "系统记录"
  };
  return labels[type];
}

function extractImageSource(text = "") {
  const clean = text.trim();
  if (/^(https?:\/\/|\/generated\/|data:image\/|blob:)/iu.test(clean)) {
    return clean;
  }

  return clean.match(/(https?:\/\/[^\s"'<>]+|\/generated\/[^\s"'<>]+|data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+)/iu)?.[1] || "";
}

function getPromptRecordPageNumber(record: PromptRecord) {
  const text = `${record.label}\n${record.prompt}`;
  const zhMatch = text.match(/第\s*(\d+)\s*页/u);
  const enMatch = text.match(/\bPage\s*(\d+)\b/iu);
  const value = Number(zhMatch?.[1] || enMatch?.[1] || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getPromptRecordPreviewImageUrl(record: PromptRecord, pages: PictureBookPage[] = []) {
  const outputImage = extractImageSource(record.output);
  if (outputImage) {
    return outputImage;
  }

  const pageNumber = getPromptRecordPageNumber(record);
  return pages.find((page) => page.pageNumber === pageNumber)?.imageUrl || "";
}

function isGeneratedImageRecord(record: PromptRecord) {
  return Boolean(extractImageSource(record.output));
}

function getDisplayImageRecords(records: PromptRecord[]) {
  const latestRecordByPage = new Map<string, PromptRecord>();
  records
    .filter((record) => record.type === "image" && isGeneratedImageRecord(record))
    .forEach((record) => {
      const pageNumber = getPromptRecordPageNumber(record);
      latestRecordByPage.set(pageNumber ? `page-${pageNumber}` : record.id, record);
    });

  return [...latestRecordByPage.values()].sort((left, right) => {
    const leftPage = getPromptRecordPageNumber(left) || Number.MAX_SAFE_INTEGER;
    const rightPage = getPromptRecordPageNumber(right) || Number.MAX_SAFE_INTEGER;
    if (leftPage !== rightPage) {
      return leftPage - rightPage;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function cleanSpeechPart(text = "") {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。！？!?.,，、；;：:]+$/gu, "");
}

function buildPageReadText(book: PictureBook, page: PictureBookPage, includeCultureNote = true) {
  const language = book.language || "zh";
  const parts = [page.title, page.text, includeCultureNote ? page.cultureNote : ""]
    .map(cleanSpeechPart)
    .filter(Boolean);
  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

function pageNeedsSpeechPreload(book: PictureBook, page: PictureBookPage) {
  if (!page.speechAudioUrl) {
    return true;
  }
  if (page.speechAudioText !== buildPageReadText(book, page, true)) {
    return true;
  }
  return (book.language || "zh") === "en" && page.speechAudioLanguage !== "en";
}

function getCultureNoteLabel(language: BookLanguage = "zh") {
  return language === "en" ? "Guangxi Culture Mini Encyclopedia" : "广西文化小百科";
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
        speechAudioUrl: page.speechAudioUrl || currentPage?.speechAudioUrl,
        speechAudioVoice: page.speechAudioVoice || currentPage?.speechAudioVoice,
        speechAudioLanguage: page.speechAudioLanguage || currentPage?.speechAudioLanguage
      };
    }),
    promptRecords: [...mergedRecords.values()]
  };
}

function makeProgress(stage: ProductStage, title: string, detail: string, logs: string[] = []): ProductProgress {
  return {
    active: true,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    stage,
    title,
    detail,
    imageTasks: { ...emptyImageTasks },
    logs
  };
}

function appendProgressLog(progress: ProductProgress, lines: string[]) {
  const nextLogs = [...progress.logs];
  lines.map((line) => line.trim()).filter(Boolean).forEach((line) => {
    if (!nextLogs.includes(line)) {
      nextLogs.push(line);
    }
  });
  return {
    ...progress,
    logs: nextLogs.slice(-16)
  };
}

export default function ProductShelfApp() {
  const initialRoute = useMemo(() => parseProductRoute(), []);
  const [books, setBooks] = useState<PictureBookSummary[]>([]);
  const [activeBook, setActiveBook] = useState<PictureBook | null>(null);
  const [view, setView] = useState<ProductView>(initialRoute.view);
  const [routeBookId, setRouteBookId] = useState(initialRoute.bookId || "");
  const [idea, setIdea] = useState(defaultIdea);
  const [bookLanguage, setBookLanguage] = useState<BookLanguage>("zh");
  const [protagonistGender, setProtagonistGender] = useState<ProtagonistGender>("girl");
  const [shouldGenerateImage, setShouldGenerateImage] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [, setNotice] = useState("");
  const [progress, setProgress] = useState<ProductProgress | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PictureBookSummary | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [readingMode, setReadingMode] = useState<ReadingMode>("idle");
  const [readingPageNumber, setReadingPageNumber] = useState<number | null>(null);
  const creationPanelRef = useRef<HTMLDivElement | null>(null);
  const ideaInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const readingSessionRef = useRef(0);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const displayBooks = useMemo(() => books.map(displayBookSummary), [books]);
  const displayActiveBook = useMemo(() => (activeBook ? displayBook(activeBook) : null), [activeBook]);
  const selectedPageIndex = displayActiveBook ? Math.min(pageIndex, Math.max(displayActiveBook.pages.length - 1, 0)) : 0;
  const rawSelectedPage = activeBook?.pages[selectedPageIndex] || null;
  const selectedPage = displayActiveBook?.pages[selectedPageIndex] || null;
  const latestBook = books[0] || null;

  useEffect(() => {
    document.title = productTitle;
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/shelf");
    }
    void refreshBooks({ selectLatest: true });
    return () => stopProductSpeech();
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = parseProductRoute();
      setView(nextRoute.view);
      setRouteBookId(nextRoute.bookId || "");
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (routeBookId && activeBook?.id !== routeBookId) {
      void openBook(routeBookId, { silent: true, nextView: view });
    }
  }, [activeBook?.id, routeBookId, view]);

  useEffect(() => {
    stopReading();
    setPageIndex(0);
  }, [activeBook?.id]);

  useEffect(() => {
    if (!progress?.active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setProgress((current) =>
        current?.active
          ? {
              ...current,
              elapsedSeconds: Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000))
            }
          : current
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [progress?.active]);

  async function refreshBooks(options?: { selectLatest?: boolean; silent?: boolean }) {
    try {
      const nextBooks = await listPictureBooks();
      setBooks(nextBooks);
      if (options?.selectLatest && nextBooks[0]) {
        const route = parseProductRoute();
        if (!route.bookId) {
          void openBook(nextBooks[0].id, { silent: true, nextView: route.view });
        }
      }
      return nextBooks;
    } catch (error) {
      const message = error instanceof Error ? error.message : "书架刷新失败";
      if (!options?.silent) {
        setNotice(`书架刷新失败：${message}`);
      }
      return books;
    }
  }

  async function openBook(id: string, options?: { silent?: boolean; nextView?: ProductView }) {
    try {
      const book = await getPictureBook(id);
      setActiveBook(book);
      setView(options?.nextView || "detail");
      setProgress(null);
      if (!options?.silent) {
        setNotice("绘本已经打开，可以查看故事、小百科、创作记录或进入绘本剧场。");
      }
      if (book.pages.some((page) => pageNeedsSpeechPreload(book, page))) {
        void preloadSpeech(book.id);
      }
      return book;
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本打开失败";
      setNotice(`绘本打开失败：${message}`);
      return null;
    }
  }

  async function preloadSpeech(bookId: string) {
    try {
      const data = await preloadPictureBookSpeech(bookId);
      if (data.book) {
        setActiveBook((current) => mergePictureBook(current, data.book!));
      }
      if (data.books.length) {
        setBooks(data.books);
      }
    } catch {
      // 朗读预加载失败时仍然保留绘本阅读能力。
    }
  }

  function navigateToShelf() {
    window.location.hash = "#/shelf";
    void refreshBooks({ silent: true });
  }

  function navigateToDesk() {
    window.location.hash = "#/desk";
    setView("desk");
    setProgress(null);
    window.setTimeout(() => ideaInputRef.current?.focus(), 260);
  }

  function navigateToRecords() {
    window.location.hash = "#/records";
    setView("records");
    void refreshBooks({ selectLatest: true, silent: true });
  }

  function navigateToAbout() {
    window.location.hash = "#/about";
    setView("about");
  }

  function navigateToBook(bookId: string, nextView: ProductView = "detail") {
    window.location.hash = bookRoute(bookId, nextView);
    void openBook(bookId, { nextView });
  }

  function startNewBook() {
    navigateToDesk();
    setProgress(null);
    setIdea("");
    setNotice("");
    creationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function pickIdea(chip: string) {
    setIdea(chip);
    setNotice("灵感已经放到新建绘本里，可以直接开始创作。");
    creationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function generateBook(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanIdea = idea.trim();
    if (!cleanIdea || isGenerating) {
      return;
    }

    setIsGenerating(true);
    window.location.hash = "#/desk";
    setView("desk");
    setActiveBook(null);
    setProgress(makeProgress("analysis", "AI 正在分析灵感", "正在提取地点、主角、广西文化元素和故事动作。", [`收到灵感：${compactText(cleanIdea, 80)}`]));
    setNotice(`${companionName}正在分析灵感，稍后会生成绘本内容。`);

    try {
      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                stage: "content",
                title: "AI 正在生成绘本内容",
                detail: "正在整理标题、4 页故事、小百科、讲解词和插图提示。"
              },
              ["开始生成标题、故事、讲解词和图片 Prompt。"]
            )
          : current
      );

      const draft = await createPictureBookDraft({
        idea: cleanIdea,
        language: bookLanguage,
        protagonistGender
      });
      setActiveBook(draft.book);
      setBooks(draft.books);
      setPageIndex(0);
      setView("desk");

      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                stage: shouldGenerateImage ? "images" : "saved",
                title: shouldGenerateImage ? "正在生成 4 页插图" : "正在保存到绘本书架",
                detail: shouldGenerateImage ? "绘本内容已完成，正在把每一页画成插图。" : "故事、小百科和创作记录正在保存。"
              },
              [
                `标题：${compactText(draft.book.title, 60)}`,
                `故事路线：${compactText(draft.book.outline, 88)}`,
                shouldGenerateImage ? "4 页插图任务已经开始。" : `作品准备放入${bookshelfTitle}。`
              ]
            )
          : current
      );

      if (shouldGenerateImage) {
        const runningTasks = draft.book.pages.reduce<Record<number, ImageTaskStatus>>(
          (tasks, page) => ({ ...tasks, [page.pageNumber]: "running" }),
          { ...emptyImageTasks }
        );
        setProgress((current) =>
          current
            ? {
                ...current,
                imageTasks: runningTasks
              }
            : current
        );

        const imageResults = await Promise.allSettled(
          draft.book.pages.map(async (page) => {
            try {
              const book = await generatePictureBookPageImage(draft.book.id, page.pageNumber);
              setActiveBook((current) => mergePictureBook(current, book));
              setProgress((current) =>
                current
                  ? appendProgressLog(
                      {
                        ...current,
                        imageTasks: { ...current.imageTasks, [page.pageNumber]: "done" }
                      },
                      [`第 ${page.pageNumber} 页插图已保存。`]
                    )
                  : current
              );
              return book;
            } catch (error) {
              setProgress((current) =>
                current
                  ? appendProgressLog(
                      {
                        ...current,
                        imageTasks: { ...current.imageTasks, [page.pageNumber]: "error" }
                      },
                      [`第 ${page.pageNumber} 页插图暂时失败，可稍后重画。`]
                    )
                  : current
              );
              throw error;
            }
          })
        );

        if (bookLanguage === "zh") {
          void preloadSpeech(draft.book.id);
        }

        const failedCount = imageResults.filter((result) => result.status === "rejected").length;
        setProgress((current) =>
          current
            ? appendProgressLog(
                {
                  ...current,
                  active: false,
                  stage: "saved",
                  title: failedCount ? "绘本已保存，部分插图可重画" : "绘本已保存到书架",
                  detail: failedCount ? `有 ${failedCount} 页插图暂时没画好，作品已先入库。` : "4 页故事、插图、小百科和创作记录都已保存。",
                  error: failedCount ? "部分插图生成失败" : undefined
                },
                [failedCount ? "绘本已进入书架，失败插图可以在打开绘本后重画。" : `绘本已进入${bookshelfTitle}。`]
              )
            : current
        );
        await refreshBooks();
        setNotice(failedCount ? "绘本已保存，有几页插图可以继续重画。" : `绘本已保存到${bookshelfTitle}。`);
      } else {
        if (bookLanguage === "zh") {
          void preloadSpeech(draft.book.id);
        }
        setProgress((current) =>
          current
            ? appendProgressLog(
                {
                  ...current,
                  active: false,
                  stage: "saved",
                  title: "绘本已保存到书架",
                  detail: "故事、小百科和创作记录已保存，插图可以稍后补画。"
                },
                [`绘本已进入${bookshelfTitle}。`]
              )
            : current
        );
        await refreshBooks();
        setNotice(`绘本已保存到${bookshelfTitle}，可以打开继续补画插图。`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本制作失败";
      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                active: false,
                title: "创作遇到问题",
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

  function requestDeleteBook(book: PictureBookSummary) {
    setDeleteTarget(book);
    setDeletePassword("");
    setDeletePasswordError("");
    setNotice(`请确认是否删除《${displayText(book.title)}》。`);
  }

  function cancelDeleteBook() {
    setDeleteTarget(null);
    setDeletePassword("");
    setDeletePasswordError("");
  }

  async function confirmDeleteBook() {
    if (!deleteTarget) {
      return;
    }
    const password = deletePassword.trim();
    if (!password) {
      setDeletePasswordError("请输入删除密码。");
      return;
    }

    const target = deleteTarget;
    try {
      const nextBooks = await deletePictureBook(target.id, password);
      setDeleteTarget(null);
      setDeletePassword("");
      setDeletePasswordError("");
      setBooks(nextBooks);
      if (activeBook?.id === target.id) {
        const nextActiveBook = nextBooks[0];
        setActiveBook(null);
        window.location.hash = "#/shelf";
        setView("shelf");
        if (nextActiveBook) {
          void openBook(nextActiveBook.id, { silent: true, nextView: "shelf" });
        }
      }
      setProgress(null);
      setNotice(`《${displayText(target.title)}》已从${bookshelfTitle}移走。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      setDeletePasswordError(message);
      setNotice(`删除失败：${message}`);
    }
  }

  function startListening() {
    if (!speechSupported || isGenerating) {
      setNotice("当前浏览器暂不支持语音输入，可以直接输入文字灵感。");
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
    try {
      recognition.start();
      setIsListening(true);
      setNotice("我在听，请说出你的绘本灵感。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "语音输入启动失败";
      setIsListening(false);
      setNotice(`语音输入启动失败：${message}。可以直接输入文字灵感。`);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setNotice("声音灵感已经收好，可以开始生成绘本。");
  }

  function goToPage(nextIndex: number) {
    stopReading();
    if (!activeBook) {
      return;
    }
    setPageIndex(Math.min(activeBook.pages.length - 1, Math.max(0, nextIndex)));
  }

  function startReading(mode: ReadingMode, pageNumber?: number) {
    readingSessionRef.current += 1;
    setReadingMode(mode);
    setReadingPageNumber(pageNumber || null);
    return readingSessionRef.current;
  }

  function finishReading(sessionId: number) {
    if (readingSessionRef.current !== sessionId) {
      return;
    }
    setReadingMode("idle");
    setReadingPageNumber(null);
  }

  function stopReading() {
    readingSessionRef.current += 1;
    stopProductSpeech();
    setReadingMode("idle");
    setReadingPageNumber(null);
  }

  function getReusablePageAudio(rawBook: PictureBook, rawPage: PictureBookPage) {
    const rawPageReadText = buildPageReadText(rawBook, rawPage, true);
    if (rawPageReadText !== displayText(rawPageReadText)) {
      return undefined;
    }
    if ((rawBook.language || "zh") === "en" && rawPage.speechAudioLanguage !== "en") {
      return undefined;
    }
    return rawPage.speechAudioUrl;
  }

  function readCurrentPage(languageOverride?: BookLanguage) {
    if (!activeBook || !selectedPage) {
      return;
    }
    if (readingMode === "page" && readingPageNumber === selectedPage.pageNumber) {
      stopReading();
      return;
    }
    const language = languageOverride || activeBook.language || "zh";
    const sessionId = startReading("page", selectedPage.pageNumber);
    void speakProductText(
      buildPageReadText(activeBook, selectedPage, true),
      language,
      activeBook.protagonistGender || "girl",
      rawSelectedPage ? getReusablePageAudio(activeBook, rawSelectedPage) : undefined
    )
      .catch(() => {
        if (readingSessionRef.current === sessionId) {
          setNotice("朗读暂时没有播放成功，可以再点一次试试。");
        }
      })
      .finally(() => finishReading(sessionId));
  }

  function readFullBook() {
    if (!activeBook || !displayActiveBook?.pages.length) {
      return;
    }
    if (readingMode === "book") {
      stopReading();
      return;
    }
    const rawBook = activeBook;
    const displayBookForReading = displayActiveBook;
    const language = rawBook.language || "zh";
    const protagonistGender = rawBook.protagonistGender || "girl";
    const sessionId = startReading("book", displayBookForReading.pages[0]?.pageNumber);

    void (async () => {
      try {
        for (let index = 0; index < displayBookForReading.pages.length; index += 1) {
          if (readingSessionRef.current !== sessionId) {
            return;
          }

          const page = displayBookForReading.pages[index];
          const rawPage = rawBook.pages[index] || page;
          setPageIndex(index);
          setReadingPageNumber(page.pageNumber);
          await speakProductText(
            buildPageReadText(displayBookForReading, page, true),
            language,
            protagonistGender,
            getReusablePageAudio(rawBook, rawPage)
          );
        }
      } catch {
        if (readingSessionRef.current === sessionId) {
          setNotice("朗读暂时没有播放成功，可以再点一次试试。");
        }
      } finally {
        finishReading(sessionId);
      }
    })();
  }

  const shouldShowProductHeader = view !== "detail" && view !== "theater";

  return (
    <main className="shelf-app">
      {shouldShowProductHeader ? (
        <header className="product-header">
          <div className="product-brand">
            <span className="product-brand-mark" aria-hidden="true">
              <BookOpen size={24} />
            </span>
            <div>
              <p className="product-eyebrow">桂韵创想家 · {companionSchool}</p>
              <h1>{productTitle}</h1>
            </div>
          </div>
          <nav className="product-nav" aria-label="绘本产品导航">
            <button type="button" className={view === "shelf" ? "active" : ""} onClick={navigateToShelf}>
              <Home size={17} />
              我的书架
            </button>
            <button type="button" className={view === "desk" ? "active" : ""} onClick={navigateToDesk}>
              <Edit3 size={17} />
              我的书桌
            </button>
            <button type="button" className={view === "records" ? "active" : ""} onClick={navigateToRecords}>
              <FileText size={17} />
              创作记录
            </button>
            <button type="button" className={view === "about" ? "active" : ""} onClick={navigateToAbout}>
              <Info size={17} />
              项目介绍
            </button>
          </nav>
        </header>
      ) : null}

      {view === "shelf" ? (
      <section className="product-shelf-grid bookshelf-only">
        <div className="bookshelf-panel">
          <div className="product-section-head">
            <div>
              <h2>{bookshelfTitle}</h2>
              <span>{books.length ? `已保存 ${books.length} 本作品，最近更新：${latestBook ? formatShelfDate(latestBook.updatedAt) : "暂无"}` : "还没有作品，先新建第一本绘本。"}</span>
            </div>
            <div className="section-actions">
              <button className="soft-button" type="button" onClick={() => void refreshBooks()}>
                <RefreshCw size={17} />
                刷新
              </button>
            </div>
          </div>

          {books.length ? (
            <div className="cover-grid">
              {books.map((book, index) => {
                const displaySummary = displayBooks[index] || displayBookSummary(book);
                return (
                <article className={`cover-card ${activeBook?.id === book.id ? "active" : ""}`} key={book.id}>
                  <button type="button" className="cover-open" onClick={() => navigateToBook(book.id, "detail")}>
                    <div className="cover-art">
                      {book.coverImageUrl ? <img src={book.coverImageUrl} alt={displaySummary.title} /> : <ImageIcon size={34} />}
                    </div>
                    <div className="cover-copy">
                      <strong>{displaySummary.title}</strong>
                      <span>{formatShelfDate(book.updatedAt)}</span>
                      <p>{book.heritageElements.concat(book.tourismElements).slice(0, 3).join(" · ") || displaySummary.subtitle}</p>
                    </div>
                  </button>
                  <button className="cover-delete" type="button" onClick={() => requestDeleteBook(book)} aria-label={`删除${displaySummary.title}`}>
                    <Trash2 size={16} />
                  </button>
                  <div className="cover-actions">
                    <button className="soft-button" type="button" onClick={() => navigateToBook(book.id, "detail")}>
                      <BookOpen size={15} />
                      打开绘本
                    </button>
                    <button className="strong-button" type="button" onClick={() => navigateToBook(book.id, "theater")}>
                      <Volume2 size={15} />
                      剧场模式
                    </button>
                  </div>
                </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-bookshelf">
              <BookOpen size={40} />
              <h3>{bookshelfTitle}还在等第一本作品</h3>
              <p>输入一个广西文化旅行灵感，生成后会自动保存到这里。</p>
            </div>
          )}
        </div>

      </section>
      ) : null}

      {view === "desk" ? (
        <section className="product-classic-desk" aria-label="我的书桌">
          <ClassicApp embeddedInProduct />
        </section>
      ) : null}

      {view === "detail" ? (
      <section className="product-workspace">
        <ReaderWorkspace
          activeBook={displayActiveBook}
          selectedPage={selectedPage}
          selectedPageIndex={selectedPageIndex}
          view={view}
          imageTasks={progress?.imageTasks}
          onSetView={(nextView) => {
            if (activeBook && (nextView === "records" || nextView === "theater" || nextView === "detail")) {
              navigateToBook(activeBook.id, nextView);
              return;
            }
            setView(nextView);
          }}
          onBackToShelf={navigateToShelf}
          onGoToPage={goToPage}
          onReadCurrentPage={readCurrentPage}
          onReadFullBook={readFullBook}
          readingMode={readingMode}
          readingPageNumber={readingPageNumber}
        />
      </section>
      ) : null}

      {view === "records" ? (
        <RecordsLibrary
          books={displayBooks}
          activeBook={displayActiveBook}
          onSelectBook={(bookId) => navigateToBook(bookId, "records")}
          onOpenBook={(bookId) => navigateToBook(bookId, "detail")}
          onOpenTheater={(bookId) => navigateToBook(bookId, "theater")}
        />
      ) : null}

      {view === "about" ? <ProjectAboutPage onStartCreate={startNewBook} onGoToShelf={navigateToShelf} /> : null}

      {view === "theater" ? (
        <TheaterWorkspace
          activeBook={displayActiveBook}
          selectedPage={selectedPage}
          selectedPageIndex={selectedPageIndex}
          onBackToShelf={navigateToShelf}
          onGoToPage={goToPage}
          onReadCurrentPage={readCurrentPage}
          onReadFullBook={readFullBook}
          readingMode={readingMode}
          readingPageNumber={readingPageNumber}
        />
      ) : null}

      {deleteTarget ? (
        <div className="confirm-overlay" role="presentation" onClick={cancelDeleteBook}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon" aria-hidden="true">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="product-eyebrow">删除作品</p>
              <h2 id="delete-book-title">确定删除《{displayText(deleteTarget.title)}》吗？</h2>
              <p>删除后会从“{bookshelfTitle}”移走这本作品，不能在页面里恢复。</p>
            </div>
            <label className="delete-password-field" htmlFor="delete-book-password">
              <span>删除密码</span>
              <input
                id="delete-book-password"
                type="password"
                value={deletePassword}
                autoComplete="off"
                onChange={(event) => {
                  setDeletePassword(event.target.value);
                  setDeletePasswordError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void confirmDeleteBook();
                  }
                }}
                placeholder="请输入删除密码"
              />
            </label>
            {deletePasswordError ? (
              <p className="delete-password-error" role="alert">
                {deletePasswordError}
              </p>
            ) : null}
            <div className="confirm-actions">
              <button className="soft-button" type="button" onClick={cancelDeleteBook}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmDeleteBook()} disabled={!deletePassword.trim()}>
                <Trash2 size={17} />
                删除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

const aboutBusinessCards = [
  {
    icon: Lightbulb,
    title: "我们为什么想做",
    text: "我们喜欢故事、绘画和家乡文化，也想练习表达能力，所以想做一个能把一句灵感变成绘本的 AI 创作伙伴。"
  },
  {
    icon: Compass,
    title: "我们想介绍广西",
    text: "我们希望故事里能自然出现三月三、山歌、绣球、漓江、螺蛳粉、坭兴陶和三娘湾这些熟悉又有特色的广西元素。"
  },
  {
    icon: Sparkles,
    title: "我们和 AI 分工",
    text: "我们负责提出想法、判断故事好不好、选择想展示的文化；AI 负责追问、整理、画图和朗读，最后一起完成作品。"
  }
];

const aboutTechCards = [
  {
    icon: Cpu,
    title: "我们搭了两个工作区",
    text: "前端像看得见的舞台，负责书架、书桌、阅读和剧场；后端像后台工作间，负责保护密钥、调用模型和保存作品。"
  },
  {
    icon: Route,
    title: "我们让模型接力",
    text: "文字模型先写故事和小百科，图片模型再画每页插图，语音模型最后朗读绘本，就像三段接力把作品做完整。"
  },
  {
    icon: ShieldCheck,
    title: "我们做了兜底",
    text: "如果模型暂时失败，系统会用本地演示内容、占位插图或浏览器朗读先接住，比赛展示时页面不容易空白。"
  }
];

const aboutWorkflow = [
  "我们先输入一句广西故事灵感",
  `${companionName}提取地点、人物、动作和文化线索`,
  "AI 整理成 4 页绘本故事与文化小百科",
  "系统为每页生成插图提示词并绘制画面",
  "作品保存到书架，我们进入剧场朗读展示"
];

function ProjectAboutPage({ onStartCreate, onGoToShelf }: { onStartCreate: () => void; onGoToShelf: () => void }) {
  return (
    <section className="about-page" aria-label="项目介绍">
      <div className="about-hero">
        <div className="about-hero-copy">
          <p className="product-eyebrow">项目介绍</p>
          <h2>肖予曦、温彼得、韦依辰和 AI 一起做出的“桂韵创想家”</h2>
          <p>
            我们做这个项目，是想让小朋友从一句自己的灵感出发，在 AI 的陪伴下完成故事构思、广西文化选择、绘本分镜、插图生成、朗读展示和作品保存。它强调的不是“AI 替我们写完”，而是“我们提出想法，AI 引导我们思考，我们一起把想法做成作品”。
          </p>
          <div className="about-hero-actions">
            <button className="strong-button" type="button" onClick={onStartCreate}>
              <Plus size={17} />
              开始创作
            </button>
            <button className="soft-button" type="button" onClick={onGoToShelf}>
              <BookOpen size={17} />
              查看书架
            </button>
          </div>
        </div>
        <div className="about-hero-card" aria-label="项目能力概览">
          <span>
            <BookOpen size={22} />
            4 页绘本
          </span>
          <span>
            <ImageIcon size={22} />
            AI 插图
          </span>
          <span>
            <Volume2 size={22} />
            绘本朗读
          </span>
          <span>
            <FileText size={22} />
            创作记录
          </span>
        </div>
      </div>

      <section className="about-theme-section" aria-labelledby="about-business-title">
        <div className="about-theme-head">
          <span>01</span>
          <div>
            <p className="product-eyebrow">业务介绍</p>
            <h3 id="about-business-title">我们想让更多小朋友用绘本介绍广西</h3>
          </div>
        </div>
        <div className="about-section-grid">
          {aboutBusinessCards.map((item) => {
            const Icon = item.icon;
            return (
              <article className="about-principle-card" key={item.title}>
                <span aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h4>{item.title}</h4>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>

        <div className="about-detail-layout">
          <section className="about-panel">
            <div className="mini-head">
              <div>
                <p className="product-eyebrow">创作原理</p>
                <h3>从“我们的表达”到“可展示作品”</h3>
              </div>
              <Route size={22} />
            </div>
            <ol className="about-flow-list">
              {aboutWorkflow.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section className="about-panel">
            <div className="mini-head">
              <div>
                <p className="product-eyebrow">设计构想</p>
                <h3>把比赛演示、真实学习和家乡文化放在一起</h3>
              </div>
              <Cpu size={22} />
            </div>
            <div className="about-copy-stack">
              <p>从业务上看，我们把“写作练习、家乡文化表达、比赛展示”合成一条完整路线：先说出灵感，再和 AI 共创，最后形成可以朗读和展示的绘本作品。</p>
              <p>系统会优先保留我们输入里的具体地点、食物、节日、活动和心情，再把合适的广西非遗、文旅、美食与山水元素织进故事。</p>
              <p>创作记录页面会展示故事提示词、每页故事输出和实际插图生成结果，让评委能看见 AI 如何参与，也能看见我们自己的创作起点。</p>
            </div>
          </section>
        </div>
      </section>

      <section className="about-theme-section" aria-labelledby="about-tech-title">
        <div className="about-theme-head">
          <span>02</span>
          <div>
            <p className="product-eyebrow">技术实现</p>
            <h3 id="about-tech-title">我们怎样把想法做成可以运行的软件</h3>
          </div>
        </div>
        <div className="about-section-grid about-tech-grid">
          {aboutTechCards.map((item) => {
            const Icon = item.icon;
            return (
              <article className="about-principle-card tech" key={item.title}>
                <span aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h4>{item.title}</h4>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function SegmentedControl({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            type="button"
            className={option.value === value ? "active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const deskProgressSteps = [
  { stage: "input", label: "写下灵感" },
  { stage: "content", label: "整理故事" },
  { stage: "images", label: "绘制插图" },
  { stage: "saved", label: "装订成册" },
  { stage: "saved", label: "放进书架" }
] satisfies { stage: ProductStage; label: string }[];

const deskStageOrder: Record<ProductStage, number> = {
  input: 0,
  analysis: 1,
  content: 1,
  images: 2,
  saved: 4
};

const deskStagePercent: Record<ProductStage, number> = {
  input: 10,
  analysis: 30,
  content: 52,
  images: 76,
  saved: 100
};

function DeskStage({
  activeBook,
  progress,
  onOpenBook,
  onOpenRecords,
  onReadFullBook
}: {
  activeBook: PictureBook | null;
  progress: ProductProgress | null;
  onOpenBook: () => void;
  onOpenRecords: () => void;
  onReadFullBook: () => void;
}) {
  const currentStep = progress ? deskStageOrder[progress.stage] : 0;
  const progressPercent = progress ? deskStagePercent[progress.stage] : 0;
  const hasImageTasks = progress ? Object.values(progress.imageTasks).some((status) => status !== "idle") : false;
  const stageTitle = progress?.active
    ? `${companionName}正在读我的灵感，马上开始整理故事`
    : activeBook
      ? "绘本已经装订好，可以打开阅读"
      : `从一句灵感开始，${companionName}陪我做一本广西文化绘本`;

  return (
    <section className={`desk-stage ${progress ? "has-progress" : "is-empty"}`}>
      <div className="desk-stage-head">
        <div>
          <p className="product-eyebrow">{companionName}绘本工坊</p>
          <h2>{activeBook ? activeBook.title : `${companionName}的绘本工坊`}</h2>
        </div>
        <div className="section-actions">
          <button className="soft-button" type="button" onClick={onReadFullBook} disabled={!activeBook}>
            <Volume2 size={17} />
            朗读绘本
          </button>
          <button className="soft-button" type="button" onClick={onOpenRecords} disabled={!activeBook}>
            <FileText size={17} />
            创作记录
          </button>
        </div>
      </div>

      {progress ? (
        <div className={`desk-progress-board ${progress.error ? "has-error" : ""}`}>
          <div className="desk-progress-banner">
            <Paintbrush size={22} />
            <strong>{stageTitle}</strong>
          </div>
          <div className="desk-progress-card">
            <div className="mini-head">
              <div>
                <p className="product-eyebrow">绘本制作进度</p>
                <h3>{progress.title}</h3>
              </div>
              <span className="elapsed-pill">
                <Clock size={15} />
                陪伴 {progress.elapsedSeconds}s
              </span>
            </div>
            <p>{progress.detail}</p>
            <div className="desk-progress-rail" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="desk-stage-steps" aria-label="绘本制作阶段">
              {deskProgressSteps.map((step, index) => {
                const done = index < currentStep || (!progress.active && progress.stage === "saved");
                const active = index === currentStep && progress.active;
                return (
                  <span className={`${done ? "done" : ""} ${active ? "active" : ""}`} key={`${step.stage}-${step.label}`}>
                    {done ? <CheckMarkIcon /> : <i />}
                    {step.label}
                  </span>
                );
              })}
            </div>
            {hasImageTasks ? (
              <div className="task-row desk-task-row">
                {[1, 2, 3, 4].map((pageNumber) => (
                  <span className={progress.imageTasks[pageNumber]} key={pageNumber}>
                    第 {pageNumber} 页
                  </span>
                ))}
              </div>
            ) : null}
            <div className="desk-log-panel">
              <div className="mini-head">
                <strong>创作过程</strong>
                <span>公开草稿流</span>
              </div>
              <div className="log-list">
                {progress.logs.map((log, index) => (
                  <p key={`${log}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {log}
                  </p>
                ))}
              </div>
            </div>
            {!progress.active && activeBook ? (
              <div className="desk-complete-actions">
                <button className="strong-button" type="button" onClick={onOpenBook}>
                  <BookOpen size={17} />
                  打开绘本
                </button>
                <button className="soft-button" type="button" onClick={onOpenRecords}>
                  <FileText size={17} />
                  查看提示词记录
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="desk-empty">
          <Edit3 size={46} />
          <h2>从一句灵感开始</h2>
          <p>在我的书桌输入或说出广西文化旅行故事，{companionName}会帮我整理成 4 页绘本、插图和小讲解词。</p>
        </div>
      )}
    </section>
  );
}

function CheckMarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ProductProgressPanel({ progress }: { progress: ProductProgress }) {
  const hasImageTasks = Object.values(progress.imageTasks).some((status) => status !== "idle");
  return (
    <section className={`product-progress ${progress.error ? "has-error" : ""}`}>
      <div className="mini-head">
        <div>
          <p className="product-eyebrow">实时创作进度</p>
          <h3>{progress.title}</h3>
        </div>
        <span className="elapsed-pill">
          <Clock size={15} />
          {progress.elapsedSeconds}s
        </span>
      </div>
      <p>{progress.detail}</p>
      {hasImageTasks ? (
        <div className="task-row">
          {[1, 2, 3, 4].map((pageNumber) => (
            <span className={progress.imageTasks[pageNumber]} key={pageNumber}>
              第 {pageNumber} 页
            </span>
          ))}
        </div>
      ) : null}
      <div className="log-list">
        {progress.logs.map((log, index) => (
          <p key={`${log}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {log}
          </p>
        ))}
      </div>
    </section>
  );
}

function ReaderWorkspace({
  activeBook,
  selectedPage,
  selectedPageIndex,
  view,
  imageTasks,
  onSetView,
  onBackToShelf,
  onGoToPage,
  onReadCurrentPage,
  onReadFullBook,
  readingMode,
  readingPageNumber
}: {
  activeBook: PictureBook | null;
  selectedPage: PictureBookPage | null;
  selectedPageIndex: number;
  view: ProductView;
  imageTasks?: Record<number, ImageTaskStatus>;
  onSetView: (view: ProductView) => void;
  onBackToShelf: () => void;
  onGoToPage: (pageIndex: number) => void;
  onReadCurrentPage: (languageOverride?: BookLanguage) => void;
  onReadFullBook: () => void;
  readingMode: ReadingMode;
  readingPageNumber: number | null;
}) {
  if (!activeBook) {
    return (
      <section className="reader-workspace empty-reader">
        <Paintbrush size={42} />
        <h2>打开一本绘本后，这里会显示书页</h2>
        <p>默认先看书架；点击任意封面即可打开故事、插图和文化小百科。</p>
      </section>
    );
  }

  const language = activeBook.language || "zh";
  const cultureNoteLabel = getCultureNoteLabel(language);
  const taskStatus = selectedPage ? imageTasks?.[selectedPage.pageNumber] || "idle" : "idle";
  const isReadingFullBook = readingMode === "book";
  const isReadingCurrentPage = readingMode === "page" && readingPageNumber === selectedPage?.pageNumber;

  return (
    <section className={`reader-workspace ${view === "detail" ? "is-active" : ""}`}>
      <div className="product-section-head">
        <div>
          <p className="product-eyebrow">打开绘本</p>
          <h2>{activeBook.title}</h2>
          <span>{activeBook.subtitle}</span>
        </div>
        <div className="section-actions">
          <button className="soft-button" type="button" onClick={onBackToShelf}>
            <ChevronLeft size={17} />
            返回书架
          </button>
          <button
            className={`soft-button reading-button ${isReadingFullBook ? "is-reading" : ""}`}
            type="button"
            onClick={onReadFullBook}
            aria-pressed={isReadingFullBook}
          >
            {isReadingFullBook ? <LoaderCircle className="spinner-icon" size={17} /> : <Volume2 size={17} />}
            {isReadingFullBook ? "停止朗读" : "朗读全书"}
          </button>
          <button className="soft-button" type="button" onClick={() => onSetView("records")}>
            <FileText size={17} />
            创作记录
          </button>
          <a
            className="soft-button export-book-button"
            href={`/api/picture-books/${encodeURIComponent(activeBook.id)}/pdf?v=storybook-pages-v6`}
            download
            title="下载 A4 横版绘本 PDF，共 5 页"
          >
            <Download size={17} />
            下载 PDF
          </a>
          <button className="strong-button" type="button" onClick={() => onSetView("theater")}>
            <ExternalLink size={17} />
            进入剧场
          </button>
        </div>
      </div>

      {selectedPage ? (
        <div className="reader-book-layout">
          <div className="open-book">
            <div className="book-page image-page">
              {selectedPage.imageUrl ? (
                <img src={selectedPage.imageUrl} alt={`${activeBook.title} 第 ${selectedPage.pageNumber} 页`} />
              ) : (
                <div className="image-placeholder">
                  {taskStatus === "running" ? <LoaderCircle className="spinner-icon" size={36} /> : <ImageIcon size={36} />}
                  <span>{taskStatus === "running" ? "插图绘制中" : "等待插图"}</span>
                </div>
              )}
            </div>
            <article className="book-page text-page">
              <h3>{selectedPage.title}</h3>
              <p>{selectedPage.text}</p>
              <div className="culture-card">
                <strong>{cultureNoteLabel}</strong>
                <span>{selectedPage.cultureNote}</span>
              </div>
              <div className="reader-actions">
                <button
                  className={`soft-button reading-button ${isReadingCurrentPage ? "is-reading" : ""}`}
                  type="button"
                  onClick={() => onReadCurrentPage()}
                  aria-pressed={isReadingCurrentPage}
                >
                  {isReadingCurrentPage ? <LoaderCircle className="spinner-icon" size={16} /> : <Volume2 size={16} />}
                  {isReadingCurrentPage ? "停止朗读" : "听这一页"}
                </button>
              </div>
            </article>
          </div>

          <div className="page-strip" aria-label="绘本页面">
            {activeBook.pages.map((page, index) => (
              <button type="button" className={index === selectedPageIndex ? "active" : ""} key={page.pageNumber} onClick={() => onGoToPage(index)}>
                {page.imageUrl ? <img src={page.imageUrl} alt={`第 ${page.pageNumber} 页缩略图`} /> : <ImageIcon size={18} />}
                <span>{language === "en" ? `Page ${page.pageNumber}` : `第 ${page.pageNumber} 页`}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-bookshelf">
          <ImageIcon size={40} />
          <h3>这本绘本还没有页面</h3>
          <p>可以重新生成一本完整绘本。</p>
        </div>
      )}
    </section>
  );
}

function RecordsLibrary({
  books,
  activeBook,
  onSelectBook,
  onOpenBook,
  onOpenTheater
}: {
  books: PictureBookSummary[];
  activeBook: PictureBook | null;
  onSelectBook: (bookId: string) => void;
  onOpenBook: (bookId: string) => void;
  onOpenTheater: (bookId: string) => void;
}) {
  const records = activeBook?.promptRecords || [];
  const storyRecords = records.filter((record) => record.type === "story");
  const imageRecords = getDisplayImageRecords(records);
  const [activeRecordTab, setActiveRecordTab] = useState<RecordTabKey>("story");
  const [activeRecordPage, setActiveRecordPage] = useState(1);
  const cultureNoteLabel = getCultureNoteLabel(activeBook?.language || "zh");
  const recordTabs: Array<{ key: RecordTabKey; label: string; count: number; unit: string }> = activeBook
      ? [
          { key: "story", label: "故事提示词", count: storyRecords.length, unit: "条" },
          { key: "pages", label: "故事输出", count: activeBook.pages.length, unit: "页" },
          { key: "images", label: "插图记录", count: imageRecords.length, unit: "条" }
        ]
      : [];
  const selectedStoryPage = activeBook?.pages.find((page) => page.pageNumber === activeRecordPage) || activeBook?.pages[0];

  useEffect(() => {
    setActiveRecordTab("story");
    setActiveRecordPage(activeBook?.pages[0]?.pageNumber || 1);
  }, [activeBook?.id, activeBook?.pages]);

  return (
    <section className="records-page">
      <div className="product-section-head">
        <div>
          <p className="product-eyebrow">创作记录</p>
          <h2>核心提示词和故事输出</h2>
          <span>{activeBook ? `正在查看《${activeBook.title}》，可查看故事提示词、故事输出和插图生成记录` : "选择一本绘本查看完整提示词记录"}</span>
        </div>
        <div className="section-actions">
          <button className="soft-button" type="button" onClick={() => activeBook && onOpenBook(activeBook.id)} disabled={!activeBook}>
            <BookOpen size={17} />
            打开绘本
          </button>
          <button className="strong-button" type="button" onClick={() => activeBook && onOpenTheater(activeBook.id)} disabled={!activeBook}>
            <Volume2 size={17} />
            进入剧场
          </button>
        </div>
      </div>

      <div className="records-layout">
        <aside className="record-book-selector">
          <div className="mini-head">
            <div>
              <p className="product-eyebrow">选择故事</p>
              <h3>我的绘本</h3>
            </div>
            <span>{books.length} 本</span>
          </div>
          {books.length ? (
            <div className="record-story-list">
              {books.map((book) => (
                <button
                  type="button"
                  className={`record-story-button ${activeBook?.id === book.id ? "active" : ""}`}
                  key={book.id}
                  onClick={() => onSelectBook(book.id)}
                >
                  {book.coverImageUrl ? <img src={book.coverImageUrl} alt={book.title} /> : <BookOpen size={18} />}
                  <span>
                    <strong>{book.title}</strong>
                    <small>{formatShelfDate(book.updatedAt)}</small>
                    <em>{compactText(book.subtitle, 42)}</em>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="record-empty compact">
              <FileText size={26} />
              <p>书架里还没有可查看的创作记录。</p>
            </div>
          )}
        </aside>

        <div className="record-detail-panel">
          {activeBook ? (
            <>
              <article className="record-book-summary">
                <div>
                  <p className="product-eyebrow">当前故事</p>
                  <h3>{activeBook.title}</h3>
                  <span>{activeBook.subtitle}</span>
                </div>
                <div className="record-meta-pills">
                  <span>{activeBook.language === "en" ? "English" : "中文"}</span>
                  <span>{activeBook.protagonistGender === "boy" ? "男孩主角" : "女孩主角"}</span>
                  <span>{formatShelfDate(activeBook.updatedAt)}</span>
                </div>
                <div className="prompt-block">
                  <span>原始灵感</span>
                  <pre>{activeBook.originalIdea}</pre>
                </div>
                <div className="prompt-block">
                  <span>故事大纲</span>
                  <pre>{activeBook.outline}</pre>
                </div>
              </article>

              <section className="records-tab-shell">
                <div className="records-tabs" role="tablist" aria-label="创作记录分类">
                  {recordTabs.map((tab) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeRecordTab === tab.key}
                      aria-controls={`record-panel-${tab.key}`}
                      id={`record-tab-${tab.key}`}
                      className={`record-tab-button ${activeRecordTab === tab.key ? "active" : ""}`}
                      key={tab.key}
                      onClick={() => setActiveRecordTab(tab.key)}
                    >
                      <span>{tab.label}</span>
                      <small>
                        {tab.count} {tab.unit}
                      </small>
                    </button>
                  ))}
                </div>

                <div className="records-tab-panel" id={`record-panel-${activeRecordTab}`} role="tabpanel" aria-labelledby={`record-tab-${activeRecordTab}`}>
                  {activeRecordTab === "story" ? (
                    <PromptGroup title="核心创建故事提示词" description="生成标题、4 页故事、小百科、讲解词时使用的主提示词。" records={storyRecords} />
                  ) : null}

                  {activeRecordTab === "pages" ? (
                    <section className="story-output-panel">
                      <div className="mini-head">
                        <div>
                          <p className="product-eyebrow">故事输出</p>
                          <h3>各页故事与插图提示词</h3>
                        </div>
                        <span>{activeBook.pages.length} 页</span>
                      </div>
                      <div className="record-page-tabs" role="tablist" aria-label="故事页面">
                        {activeBook.pages.map((page) => (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={selectedStoryPage?.pageNumber === page.pageNumber}
                            className={`record-page-tab ${selectedStoryPage?.pageNumber === page.pageNumber ? "active" : ""}`}
                            key={page.pageNumber}
                            onClick={() => setActiveRecordPage(page.pageNumber)}
                          >
                            第 {page.pageNumber} 页
                          </button>
                        ))}
                      </div>
                      {selectedStoryPage ? (
                        <article className="story-output-card story-output-card-single">
                          <div className="page-number-pill">第 {selectedStoryPage.pageNumber} 页</div>
                          <h4>{selectedStoryPage.title}</h4>
                          <p>{selectedStoryPage.text}</p>
                          <div className="prompt-block">
                            <span>本页插图提示词</span>
                            <pre>{selectedStoryPage.imagePrompt}</pre>
                          </div>
                          <div className="prompt-block">
                            <span>{cultureNoteLabel}</span>
                            <pre>{selectedStoryPage.cultureNote}</pre>
                          </div>
                        </article>
                      ) : (
                        <div className="record-empty compact">
                          <FileText size={24} />
                          <p>这本绘本还没有页面。</p>
                        </div>
                      )}
                    </section>
                  ) : null}

                  {activeRecordTab === "images" ? (
                    <PromptGroup
                      title="插图生成记录"
                      description="每页只显示最新一次实际生成图片的记录；插图提示词可以在“故事输出”里查看。"
                      records={imageRecords}
                      imagePreviewPages={activeBook.pages}
                      emptyText="这本绘本还没有实际生成过插图。"
                    />
                  ) : null}
                </div>
              </section>
            </>
          ) : (
            <div className="record-empty records-empty-state">
              <FileText size={36} />
              <h3>请选择一本绘本</h3>
              <p>选择左侧故事后，可以查看核心提示词、故事输出和各页插图提示词。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PromptGroup({
  title,
  description,
  records,
  imagePreviewPages,
  emptyText = "还没有这类记录。"
}: {
  title: string;
  description: string;
  records: PromptRecord[];
  imagePreviewPages?: PictureBookPage[];
  emptyText?: string;
}) {
  const shouldShowImagePreview = typeof imagePreviewPages !== "undefined";

  return (
    <section className="prompt-group">
      <div className="mini-head">
        <div>
          <p className="product-eyebrow">Prompt</p>
          <h3>{title}</h3>
        </div>
        <span>{records.length} 条</span>
      </div>
      <p>{description}</p>
      {records.length ? (
        <div className="prompt-card-list">
          {records.map((record) => (
            <PromptRecordCard
              record={record}
              showImagePreview={shouldShowImagePreview}
              previewImageUrl={shouldShowImagePreview ? getPromptRecordPreviewImageUrl(record, imagePreviewPages) : ""}
              key={record.id}
            />
          ))}
        </div>
      ) : (
        <div className="record-empty compact">
          <FileText size={24} />
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  );
}

function PromptRecordCard({ record, previewImageUrl = "", showImagePreview = false }: { record: PromptRecord; previewImageUrl?: string; showImagePreview?: boolean }) {
  const [activeContentTab, setActiveContentTab] = useState<PromptContentTabKey>("prompt");
  const activeContent = activeContentTab === "prompt" ? record.prompt : record.output;

  return (
    <article className={`prompt-card ${showImagePreview ? "has-image-preview" : ""}`}>
      <div className="record-card-head">
        <span>{getRecordTypeLabel(record.type)}</span>
        <small>{formatRecordTime(record.createdAt)}</small>
      </div>
      <h4>{record.label}</h4>
      <div className="prompt-card-body">
        <div className="prompt-card-main">
          <div className="prompt-content-tabs" role="tablist" aria-label={`${record.label}内容`}>
            <button
              type="button"
              role="tab"
              aria-selected={activeContentTab === "prompt"}
              aria-controls={`prompt-content-${record.id}`}
              className={`prompt-content-tab ${activeContentTab === "prompt" ? "active" : ""}`}
              onClick={() => setActiveContentTab("prompt")}
            >
              提示词
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeContentTab === "output"}
              aria-controls={`prompt-content-${record.id}`}
              className={`prompt-content-tab ${activeContentTab === "output" ? "active" : ""}`}
              onClick={() => setActiveContentTab("output")}
            >
              输出结果
            </button>
          </div>
          <div className="prompt-content-panel prompt-block" id={`prompt-content-${record.id}`} role="tabpanel">
            <pre>{activeContent}</pre>
          </div>
        </div>

        {showImagePreview ? (
          <figure className="prompt-image-preview">
            <span>对应插图</span>
            <div className="prompt-image-frame">
              {previewImageUrl ? <img src={previewImageUrl} alt={`${record.label}插图预览`} /> : <ImageIcon size={32} />}
            </div>
            {!previewImageUrl ? <figcaption>这条记录还没有生成图片</figcaption> : null}
          </figure>
        ) : null}
      </div>
    </article>
  );
}

function TheaterWorkspace({
  activeBook,
  selectedPage,
  selectedPageIndex,
  onBackToShelf,
  onGoToPage,
  onReadCurrentPage,
  onReadFullBook,
  readingMode,
  readingPageNumber
}: {
  activeBook: PictureBook | null;
  selectedPage: PictureBookPage | null;
  selectedPageIndex: number;
  onBackToShelf: () => void;
  onGoToPage: (pageIndex: number) => void;
  onReadCurrentPage: (languageOverride?: BookLanguage) => void;
  onReadFullBook: () => void;
  readingMode: ReadingMode;
  readingPageNumber: number | null;
}) {
  const [theaterMode, setTheaterMode] = useState<"showcase" | "self">("showcase");

  if (!activeBook || !selectedPage) {
    return null;
  }

  const language = activeBook.language || "zh";
  const currentReadLabel = language === "en" ? "English" : "中文朗读";
  const isReadingFullBook = readingMode === "book";
  const isReadingCurrentPage = readingMode === "page" && readingPageNumber === selectedPage.pageNumber;

  return (
    <section className="theater-workspace">
      <div className="theater-curtain">
        <div className="theater-screen">
          {selectedPage.imageUrl ? <img src={selectedPage.imageUrl} alt={`${activeBook.title} 剧场展示`} /> : <ImageIcon size={48} />}
        </div>
        <article className="theater-script">
          <p className="product-eyebrow">绘本剧场</p>
          <h2>{activeBook.title}</h2>
          <h3>{selectedPage.title}</h3>
          <p>{selectedPage.text}</p>
          <div className="theater-mode-switch" aria-label="展示或阅读模式">
            <button type="button" className={theaterMode === "showcase" ? "active" : ""} onClick={() => setTheaterMode("showcase")}>
              比赛展示
            </button>
            <button type="button" className={theaterMode === "self" ? "active" : ""} onClick={() => setTheaterMode("self")}>
              自己阅读
            </button>
          </div>
          <div className="theater-mode-note">
            <strong>阅读模式</strong>
            <span>{theaterMode === "showcase" ? "适合比赛现场投屏展示，保留大画面和朗读控制。" : "适合自己慢慢读，按页切换，随时听当前页。"}</span>
          </div>
          <div className="reader-actions">
            <button className="soft-button" type="button" onClick={onBackToShelf}>
              <ChevronLeft size={17} />
              返回书架
            </button>
            <button
              className={`strong-button reading-button ${isReadingFullBook ? "is-reading" : ""}`}
              type="button"
              onClick={onReadFullBook}
              aria-pressed={isReadingFullBook}
            >
              {isReadingFullBook ? <LoaderCircle className="spinner-icon" size={17} /> : <Volume2 size={17} />}
              {isReadingFullBook ? "停止朗读" : "朗读全书"}
            </button>
            <button
              className={`soft-button reading-button ${isReadingCurrentPage ? "is-reading" : ""}`}
              type="button"
              onClick={() => onReadCurrentPage(language)}
              aria-pressed={isReadingCurrentPage}
            >
              {isReadingCurrentPage ? <LoaderCircle className="spinner-icon" size={16} /> : <Volume2 size={16} />}
              {isReadingCurrentPage ? "停止朗读" : currentReadLabel}
            </button>
          </div>
          <div className="theater-dots">
            {activeBook.pages.map((page, index) => (
              <button type="button" className={index === selectedPageIndex ? "active" : ""} key={page.pageNumber} onClick={() => onGoToPage(index)}>
                {index + 1}
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
