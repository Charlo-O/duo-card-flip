// Card faces drawn on canvas. Every coordinate is in CSS px of a 256×358 card
// and was measured from the 2x reference recording (glyph baselines, padding,
// border, radius). Canvases are rendered at TEX_SCALE texels per CSS px.

export const CARD_W = 256;
export const CARD_H = 358;
export const TEX_SCALE = 4;

const INK = "#0a0a0a";
const MUTED = "#5e5e5e";
const PAPER = "#ffffff";
const BORDER = 2;
const RADIUS = 12;
const PAD = 20;

export const SANS = '"Geist Variable", "Geist", system-ui, sans-serif';
export const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace';

const TYPE = {
  handle: { font: `400 12px ${MONO}`, color: MUTED },
  name: { font: `500 20px ${SANS}`, color: INK, tracking: -0.6 },
  role: { font: `400 14px ${SANS}`, color: MUTED },
  tagline: { font: `500 18px ${SANS}`, color: INK, tracking: -0.54 },
  pronouns: { font: `400 12px ${MONO}`, color: MUTED },
  linkLabel: { font: `400 12px ${MONO}`, color: MUTED },
  linkValue: { font: `400 12px ${MONO}`, color: INK },
};

// Pixel "CD" mark: 8×4 cells of 5px at (20, 20).
const LOGO = [".##.###.", "#...#..#", "#...#..#", ".##.###."];

function makeCtx() {
  const c = document.createElement("canvas");
  c.width = CARD_W * TEX_SCALE;
  c.height = CARD_H * TEX_SCALE;
  const ctx = c.getContext("2d");
  ctx.scale(TEX_SCALE, TEX_SCALE);
  ctx.textBaseline = "alphabetic";
  return ctx;
}

// Rounded on the outer edge, square on the spine edge.
function shapePath(ctx, spine, inset = 0) {
  const r = Math.max(RADIUS - inset, 0);
  const rl = spine === "left" ? 0 : r;
  const rr = spine === "right" ? 0 : r;
  const x0 = inset, y0 = inset, x1 = CARD_W - inset, y1 = CARD_H - inset;
  ctx.beginPath();
  ctx.moveTo(x0 + rl, y0);
  ctx.lineTo(x1 - rr, y0);
  ctx.arcTo(x1, y0, x1, y0 + rr, rr);
  ctx.lineTo(x1, y1 - rr);
  ctx.arcTo(x1, y1, x1 - rr, y1, rr);
  ctx.lineTo(x0 + rl, y1);
  ctx.arcTo(x0, y1, x0, y1 - rl, rl);
  ctx.lineTo(x0, y0 + rl);
  ctx.arcTo(x0, y0, x0 + rl, y0, rl);
  ctx.closePath();
}

// spine: which edge is the hinge (square corners). open: that edge carries no
// border so the two inside halves read as one continuous card.
function drawShell(ctx, spine, openSpine) {
  shapePath(ctx, spine);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.save();
  shapePath(ctx, spine, BORDER);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
  if (openSpine) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(spine === "left" ? 0 : CARD_W - BORDER, BORDER, BORDER, CARD_H - 2 * BORDER);
  }
}

function drawLogo(ctx) {
  ctx.fillStyle = INK;
  LOGO.forEach((row, j) => {
    [...row].forEach((cell, i) => {
      if (cell === "#") ctx.fillRect(PAD + i * 5, PAD + j * 5, 5, 5);
    });
  });
}

function text(ctx, style, str, x, baseline, align = "left") {
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textAlign = align;
  ctx.letterSpacing = `${style.tracking ?? 0}px`;
  ctx.fillText(str, x, baseline);
}

function drawIdentity(ctx) {
  text(ctx, TYPE.name, "Chánh Đại", PAD, 311);
  text(ctx, TYPE.role, "Design Engineer", PAD, 333);
}

// Front of the flipping page (the closed card).
export function makeCoverTexture() {
  const ctx = makeCtx();
  drawShell(ctx, "left", false);
  drawLogo(ctx);
  text(ctx, TYPE.handle, "@ncdai", CARD_W - PAD, 32, "right");
  drawIdentity(ctx);
  return ctx.canvas;
}

// Back of the flipping page, authored as it reads when the card is open.
export function makeInsideLeftTexture(avatar) {
  const ctx = makeCtx();
  drawShell(ctx, "right", true);
  ctx.save();
  ctx.beginPath();
  ctx.arc(PAD + 32, PAD + 32, 32, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(avatar, PAD, PAD, 64, 64);
  ctx.restore();
  text(ctx, TYPE.tagline, "Creating with code.", PAD, 283.25);
  text(ctx, TYPE.tagline, "Small details matter.", PAD, 308.25);
  text(ctx, TYPE.pronouns, "he/him", PAD, 334);
  return ctx.canvas;
}

// Static right half underneath the flipping page.
export function makeInsideRightTexture() {
  const ctx = makeCtx();
  drawShell(ctx, "left", true);
  drawLogo(ctx);
  text(ctx, TYPE.handle, "@ncdai", CARD_W - PAD, 32, "right");
  const rows = [
    ["Web", "chanhdai.com"],
    ["GitHub", "ncdai"],
    ["X", "@iamncdai"],
    ["LinkedIn", "ncdai"],
  ];
  rows.forEach(([label, value], i) => {
    const y = 136 + i * 22;
    text(ctx, TYPE.linkLabel, label, PAD, y);
    text(ctx, TYPE.linkValue, value, CARD_W - PAD - 0.5, y, "right");
  });
  drawIdentity(ctx);
  return ctx.canvas;
}

export async function loadFonts() {
  const sample = "Chánh Đại Design Engineer Creating with code. Small details matter.";
  const mono = "@ncdai he/him Web GitHub X LinkedIn chanhdai.com @iamncdai";
  await Promise.race([
    Promise.all([
      document.fonts.load(`400 14px ${SANS}`, sample),
      document.fonts.load(`500 18px ${SANS}`, sample),
      document.fonts.load(`400 12px ${MONO}`, mono),
    ]),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
