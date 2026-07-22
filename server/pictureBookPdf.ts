import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { PictureBook, PictureBookPage } from "./bookStore.js";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedDir = join(rootDir, "data", "generated");
const pageWidth = 1754;
const pageHeight = 1240;
const pdfWidth = 841.89;
const pdfHeight = 595.28;
const fontFamily = "PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif";

function escapeXml(value = "") {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function characterUnits(character: string) {
  if (/\s/u.test(character)) {
    return 0.32;
  }
  return /^[\x00-\x7F]$/u.test(character) ? 0.55 : 1;
}

function wrapText(value: string, maxUnits: number, maxLines: number) {
  const text = value.replace(/\s+/gu, " ").trim();
  const lines: string[] = [];
  let current = "";
  let units = 0;
  let consumedAll = true;

  for (const character of text) {
    const nextUnits = characterUnits(character);
    if (current && units + nextUnits > maxUnits) {
      lines.push(current.trim());
      if (lines.length >= maxLines) {
        consumedAll = false;
        break;
      }
      current = character.trimStart();
      units = character.trim() ? nextUnits : 0;
    } else {
      current += character;
      units += nextUnits;
    }
  }

  if (consumedAll && current.trim() && lines.length < maxLines) {
    lines.push(current.trim());
  }
  if (!consumedAll && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。！？、,.!?\s]+$/gu, "")}…`;
  }
  return lines;
}

function svgText(
  lines: string[],
  options: { x: number; y: number; size: number; lineHeight: number; color: string; weight?: number; anchor?: "start" | "middle" }
) {
  const { x, y, size, lineHeight, color, weight = 500, anchor = "start" } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("")}</text>`;
}

function placeholderSvg(width: number, height: number) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#f2eadc"/>
      <circle cx="${width / 2}" cy="${height / 2 - 28}" r="68" fill="#d9e9dd"/>
      <path d="M${width / 2 - 94} ${height / 2 + 90} Q${width / 2} ${height / 2 - 10} ${width / 2 + 94} ${height / 2 + 90}" fill="none" stroke="#7aa187" stroke-width="18" stroke-linecap="round"/>
      <text x="${width / 2}" y="${height / 2 + 165}" text-anchor="middle" fill="#5d8070" font-family="${fontFamily}" font-size="30" font-weight="700">绘本插图</text>
    </svg>
  `);
}

async function readImageSource(imageUrl = "") {
  const cleanUrl = imageUrl.trim();
  if (!cleanUrl) {
    return null;
  }

  if (cleanUrl.startsWith("data:image/")) {
    const match = cleanUrl.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/iu);
    return match ? Buffer.from(match[1], "base64") : null;
  }

  let pathname = cleanUrl;
  if (/^https?:\/\//iu.test(cleanUrl)) {
    const parsed = new URL(cleanUrl);
    pathname = parsed.pathname;
    if (!pathname.startsWith("/generated/")) {
      const response = await fetch(cleanUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length <= 15 * 1024 * 1024 ? bytes : null;
    }
  }

  if (pathname.startsWith("/generated/")) {
    const fileName = basename(decodeURIComponent(pathname));
    return readFile(join(generatedDir, fileName)).catch(() => null);
  }
  return null;
}

async function prepareImage(imageUrl: string, width: number, height: number, fit: "cover" | "contain") {
  const source = await readImageSource(imageUrl);
  return sharp(source || placeholderSvg(width, height))
    .rotate()
    .resize({ width, height, fit, position: "centre", background: "#fffaf0" })
    .flatten({ background: "#fffaf0" })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function prepareCoverBackground(imageUrl: string) {
  const source = await readImageSource(imageUrl);
  return sharp(source || placeholderSvg(pageWidth, pageHeight))
    .rotate()
    .resize({ width: pageWidth, height: pageHeight, fit: "cover", position: "centre" })
    .blur(18)
    .modulate({ brightness: 0.62, saturation: 0.88 })
    .flatten({ background: "#34584c" })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function prepareCoverHero(imageUrl: string, width: number, height: number) {
  const source = await readImageSource(imageUrl);
  const hero = await sharp(source || placeholderSvg(width, height))
    .rotate()
    .trim({ background: "#ffffff", threshold: 12 })
    .resize({ width, height, fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  const mask = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#000000" stop-opacity="0"/>
          <stop offset="0.2" stop-color="#ffffff" stop-opacity="0.65"/>
          <stop offset="0.38" stop-color="#ffffff" stop-opacity="1"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#fade)"/>
    </svg>
  `);
  return sharp(hero).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function renderCover(book: PictureBook) {
  const coverImageUrl = book.pages.find((page) => page.imageUrl)?.imageUrl || "";
  const blurredBackground = await prepareCoverBackground(coverImageUrl);
  const heroWidth = 1000;
  const heroLeft = pageWidth - heroWidth;
  const hero = await prepareCoverHero(coverImageUrl, heroWidth, pageHeight);
  const titleLines = wrapText(book.title, 7, 3);
  const subtitleLines = wrapText(book.subtitle, 15, 2);
  const titleY = 552 - (titleLines.length - 1) * 48;
  const subtitleY = titleY + titleLines.length * 102 + 38;
  const overlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">
      <defs>
        <linearGradient id="coverShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#102f28" stop-opacity="0.96"/>
          <stop offset="0.34" stop-color="#163a31" stop-opacity="0.9"/>
          <stop offset="0.58" stop-color="#173a31" stop-opacity="0.3"/>
          <stop offset="1" stop-color="#173a31" stop-opacity="0.04"/>
        </linearGradient>
        <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.64" stop-color="#081d18" stop-opacity="0"/>
          <stop offset="1" stop-color="#081d18" stop-opacity="0.5"/>
        </linearGradient>
        <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#0a211c" flood-opacity="0.5"/>
        </filter>
      </defs>
      <rect width="${pageWidth}" height="${pageHeight}" fill="url(#coverShade)"/>
      <rect width="${pageWidth}" height="${pageHeight}" fill="url(#bottomShade)"/>
      <path d="M126 158 l13 -13 l13 13 l-13 13 z" fill="#f2bf45"/>
      <text x="174" y="169" fill="#fff5d9" font-family="${fontFamily}" font-size="27" font-weight="700" letter-spacing="5">桂韵创想家</text>
      <text x="126" y="218" fill="#d9e4dc" font-family="${fontFamily}" font-size="20" font-weight="550" letter-spacing="3">广西文化原创绘本</text>
      <line x1="126" y1="410" x2="256" y2="410" stroke="#f2bf45" stroke-width="8" stroke-linecap="round"/>
      <g filter="url(#textShadow)">
        ${svgText(titleLines, { x: 126, y: titleY, size: 88, lineHeight: 102, color: "#fff8e8", weight: 850 })}
        ${svgText(subtitleLines, { x: 132, y: subtitleY, size: 34, lineHeight: 54, color: "#dbe8df", weight: 620 })}
      </g>
    </svg>
  `);

  return sharp(blurredBackground)
    .composite([
      { input: hero, left: heroLeft, top: 0 },
      { input: overlay, left: 0, top: 0 }
    ])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function renderStoryPage(book: PictureBook, page: PictureBookPage) {
  const imageLeft = 70;
  const imageTop = 80;
  const imageWidth = 900;
  const imageHeight = 1080;
  const copyX = 1060;
  const storyImage = await prepareImage(page.imageUrl, imageWidth, imageHeight, "contain");
  const titleLines = wrapText(page.title, 18, 2);
  const storyLines = wrapText(page.text, 23, 13);
  const cultureLines = wrapText(page.cultureNote, 27, 5);
  const titleY = 205;
  const storyY = titleY + titleLines.length * 62 + 38;
  const cultureY = storyY + storyLines.length * 42 + 42;
  const cultureHeight = Math.max(150, 82 + cultureLines.length * 35);
  const cultureLabel = (book.language || "zh") === "en" ? "Guangxi Culture" : "广西文化小百科";
  const background = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">
      <rect width="${pageWidth}" height="${pageHeight}" fill="#fffdf7"/>
      <rect x="35" y="42" width="970" height="1156" rx="26" fill="#fffaf0" stroke="#eadcc4" stroke-width="3"/>
      <rect x="1008" width="12" height="${pageHeight}" fill="#ead8ba"/>
      <text x="${copyX}" y="112" fill="#4f9f68" font-family="${fontFamily}" font-size="28" font-weight="800">${
        (book.language || "zh") === "en" ? `Page ${page.pageNumber}` : `第 ${page.pageNumber} 页`
      }</text>
      ${svgText(titleLines, { x: copyX, y: titleY, size: 52, lineHeight: 62, color: "#243d36", weight: 800 })}
      ${svgText(storyLines, { x: copyX, y: storyY, size: 27, lineHeight: 42, color: "#38524a", weight: 560 })}
      <rect x="${copyX - 18}" y="${cultureY - 55}" width="620" height="${cultureHeight}" rx="22" fill="#fff7dc" stroke="#efcf78" stroke-width="3"/>
      <text x="${copyX + 8}" y="${cultureY - 12}" fill="#8c5c1f" font-family="${fontFamily}" font-size="25" font-weight="800">${escapeXml(cultureLabel)}</text>
      ${svgText(cultureLines, { x: copyX + 8, y: cultureY + 32, size: 22, lineHeight: 35, color: "#6b4d21", weight: 520 })}
      <text x="${copyX}" y="1178" fill="#8a958f" font-family="${fontFamily}" font-size="22" font-weight="600">${escapeXml(book.title)}</text>
      <circle cx="1650" cy="1165" r="30" fill="#f2bf45"/>
      <text x="1650" y="1175" text-anchor="middle" fill="#243d36" font-family="${fontFamily}" font-size="24" font-weight="800">${page.pageNumber}</text>
    </svg>
  `);

  return sharp(background)
    .composite([{ input: storyImage, left: imageLeft, top: imageTop }])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

function fallbackPage(pageNumber: number): PictureBookPage {
  return {
    pageNumber,
    title: `第 ${pageNumber} 页`,
    text: "",
    imagePrompt: "",
    imageUrl: "",
    imageSource: "placeholder",
    cultureNote: ""
  };
}

function buildPdf(pageImages: Buffer[]) {
  const objectCount = 2 + pageImages.length * 3;
  const objects: Array<Buffer> = new Array(objectCount + 1);
  const pageObjectIds = pageImages.map((_, index) => 5 + index * 3);
  objects[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = Buffer.from(`<< /Type /Pages /Count ${pageImages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`);

  pageImages.forEach((image, index) => {
    const imageId = 3 + index * 3;
    const contentId = 4 + index * 3;
    const pageId = 5 + index * 3;
    const drawImage = Buffer.from(`q\n${pdfWidth} 0 0 ${pdfHeight} 0 0 cm\n/Im0 Do\nQ\n`);
    objects[imageId] = Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),
      image,
      Buffer.from("\nendstream")
    ]);
    objects[contentId] = Buffer.concat([
      Buffer.from(`<< /Length ${drawImage.length} >>\nstream\n`),
      drawImage,
      Buffer.from("endstream")
    ]);
    objects[pageId] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let byteLength = chunks[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = byteLength;
    const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`), objects[id], Buffer.from("\nendobj\n")]);
    chunks.push(object);
    byteLength += object.length;
  }

  const xrefOffset = byteLength;
  const xref = [
    `xref\n0 ${objectCount + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  ].join("");
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

export async function createPictureBookPdf(book: PictureBook) {
  const storyPages = Array.from({ length: 4 }, (_, index) => book.pages[index] || fallbackPage(index + 1));
  const pageImages = [await renderCover(book), ...(await Promise.all(storyPages.map((page) => renderStoryPage(book, page))))];
  return buildPdf(pageImages);
}
