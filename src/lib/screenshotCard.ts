export type ScreenshotEdit = {
  crop: { x: number; y: number; width: number; height: number };
  book: string;
  caption: string;
  text: string;
  theme: "paper" | "light" | "dark" | "receipt";
  size: "portrait" | "square" | "landscape" | "phone";
};
export type Screenshot = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  imported: boolean;
  edit: ScreenshotEdit;
};

export async function loadScreenshotImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > 40_000_000)
    throw new Error("图片超过 4000 万像素，请导入较小的截图。");
  return image;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}

// Shared renderer keeps exported pixels identical to the preview. Crop stays
// in percentage coordinates; only the derived card is ever painted or saved.
export function renderScreenshotCard(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  edit: ScreenshotEdit,
) {
  const width = edit.size === "phone" ? 1080 : 1200;
  const baseHeight =
    edit.size === "phone"
      ? 1920
      : edit.size === "portrait"
        ? 1600
        : edit.size === "square"
          ? 1200
          : 800;
  const padding = 76;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器无法生成图片。");
  ctx.font = '30px "Microsoft YaHei", sans-serif';
  const lines = wrapLines(
    ctx,
    [edit.book, edit.caption].filter(Boolean).join("\n"),
    width - padding * 2,
  );
  const footerHeight = lines.length * 46 + 85;
  const height =
    edit.size === "phone"
      ? baseHeight
      : Math.max(baseHeight, footerHeight + 420);
  canvas.width = width;
  canvas.height = height;
  const dark = edit.theme === "dark";
  ctx.fillStyle = dark
    ? "#252622"
    : edit.theme === "paper" || edit.theme === "receipt"
      ? "#f4f0e7"
      : "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const crop = edit.crop;
  const sx = (image.naturalWidth * crop.x) / 100,
    sy = (image.naturalHeight * crop.y) / 100;
  const sw = (image.naturalWidth * crop.width) / 100,
    sh = (image.naturalHeight * crop.height) / 100;
  const boxWidth = width - padding * 2,
    boxHeight = height - padding - footerHeight;
  const scale = Math.min(boxWidth / sw, boxHeight / sh);
  const dw = sw * scale,
    dh = sh * scale;
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    (width - dw) / 2,
    padding + (boxHeight - dh) / 2,
    dw,
    dh,
  );
  ctx.fillStyle = dark ? "#f3f1e9" : "#353831";
  ctx.font = '30px "Microsoft YaHei", sans-serif';
  lines.forEach((line, i) =>
    ctx.fillText(line, padding, height - footerHeight + 30 + i * 46),
  );
  ctx.fillStyle = dark ? "#b4b4a8" : "#878779";
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText("Kindle Cards", padding, height - 32);
  if (edit.theme === "receipt") {
    ctx.strokeStyle = "#8c887d";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(padding, height - 75);
    ctx.lineTo(width - padding, height - 75);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#44443c";
    for (let i = 0; i < 65; i++)
      ctx.fillRect(width - padding - 260 + i * 4, height - 51, 1 + (i % 3), 26);
    ctx.fillStyle = "#e8e4d9";
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x + 12, height - 9);
      ctx.lineTo(x + 24, height);
      ctx.fill();
    }
  }
}

export function downloadScreenshotBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
