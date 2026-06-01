import type { PictureBook, PictureBookPage, PictureBookSummary, PromptRecord } from "./types";

export const productTitle = "桂韵创想家";
export const bookshelfTitle = "我的绘本书架";
export const companionName = "桂小雅";
export const companionSchool = "桂雅路小学";

export function displayText(text = "") {
  return text
    .replace(/桂韵创想家 核心提示词/gu, "核心创建故事提示词")
    .replace(/百炼故事生成 Prompt/gu, "核心创建故事提示词")
    .replace(/故事生成 Prompt/gu, "核心创建故事提示词")
    .replace(/Guiyun Creator Core Prompt/gu, "Core Story Creation Prompt")
    .replace(/肖予曦的绘本书架/gu, bookshelfTitle)
    .replace(/肖予曦/gu, "我")
    .replace(/桂小灵/gu, companionName)
    .replace(/Gui Xiaoling/gu, "Gui Xiaoya")
    .replace(/Xiaoyuxi/gu, "me");
}

function displayPromptRecord(record: PromptRecord): PromptRecord {
  return {
    ...record,
    label: displayText(record.label),
    prompt: displayText(record.prompt),
    output: displayText(record.output)
  };
}

function displayPage(page: PictureBookPage): PictureBookPage {
  return {
    ...page,
    title: displayText(page.title),
    text: displayText(page.text),
    imagePrompt: displayText(page.imagePrompt),
    cultureNote: displayText(page.cultureNote),
    speechAudioText: page.speechAudioText ? displayText(page.speechAudioText) : page.speechAudioText
  };
}

export function displayBookSummary(book: PictureBookSummary): PictureBookSummary {
  return {
    ...book,
    title: displayText(book.title),
    subtitle: displayText(book.subtitle)
  };
}

export function displayBook(book: PictureBook): PictureBook {
  return {
    ...book,
    title: displayText(book.title),
    subtitle: displayText(book.subtitle),
    originalIdea: displayText(book.originalIdea),
    outline: displayText(book.outline),
    pages: book.pages.map(displayPage),
    tourGuideScript: displayText(book.tourGuideScript),
    studentReflection: displayText(book.studentReflection),
    promptRecords: book.promptRecords.map(displayPromptRecord)
  };
}
