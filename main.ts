// news-image-20261125: a newspaper front page for Wednesday 25 November 2026.
// Drawn entirely by this program (Node 22, standard library only): a 1024x1024
// rasterizer with a hand-built 5x7 bitmap font, flat pictograms and a PNG
// encoder written from scratch. No network, no randomness, no timestamps, so
// both graded runs write identical bytes.
//
// Stories are real headlines reported on 25 November 2026:
//   - CIA and the Office of the Director of National Intelligence hit by a
//     cyberattack (CNN / Reuters, 25 Nov)
//   - US jury convicts Huawei of trade-secret theft and bank fraud (24 Nov)
//   - Zelenskiy confirms a Ukrainian drone strike on a Russian cargo ship in
//     the Gulf of Finland (Reuters, 25 Nov)
//   - Houthis hit Riyadh's tallest tower with a drone, 11 wounded (25 Nov)
//   - WHO evacuates staff from an Ebola hospital in DRC after three days
//     sheltering from fighting (25 Nov)
//   - Trump awards Rudy Giuliani the Presidential Medal of Freedom (25 Nov)
//   - Also: Thanksgiving turkeys spared, NATO jets to Poland, GTA 6, T20, Shenzhou-24
//
// Second draft: row-3 standfirsts shortened to two lines so none touches the
// panel border, and the ship panel's explosion now sits above the hull with
// the drone beside it instead of reading as a sun.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';

// ---------------------------------------------------------------- PNG out
const W = 1024;
const H = 1024;

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePNG(rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas
type RGB = [number, number, number];
const pix = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  pix[i] = c[0]; pix[i + 1] = c[1]; pix[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) setPx(xx, yy, c);
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPx(cx + x, cy + y, c);
  }
}

function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPx(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}

function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.floor(Math.min(...xs));
      const hi = Math.ceil(Math.max(...xs));
      for (let x = lo; x <= hi; x++) setPx(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph is 7 rows of 5 bits, '1' = ink. All copy is uppercase.
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
  '\u2022': ['00000', '00000', '01100', '01100', '01100', '00000', '00000'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '@': ['01110', '10001', '10111', '10101', '10110', '10000', '01110'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '[': ['01110', '01000', '01000', '01000', '01000', '01000', '01110'],
  ']': ['01110', '00010', '00010', '00010', '00010', '00010', '01110'],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[r][col] === '1') fillRect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, Math.round(cx - textWidth(s, scale) / 2), y, scale, c);
}

function wrap(text: string, maxW: number, scale: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (textWidth(test, scale) <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(text: string, x: number, y: number, maxW: number, scale: number, c: RGB, leading: number): number {
  const lines = wrap(text, maxW, scale);
  lines.forEach((ln, i) => drawText(ln, x, y + i * leading, scale, c));
  return y + lines.length * leading;
}

// ---------------------------------------------------------------- palette
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [20, 20, 20];
const NAVY: RGB = [14, 30, 51];
const RED: RGB = [179, 38, 30];
const GREY: RGB = [90, 90, 88];
const TEAL: RGB = [15, 118, 110];
const GOLD: RGB = [217, 164, 65];
const WHITE: RGB = [255, 255, 255];
const SKY: RGB = [168, 200, 224];
const SEA: RGB = [29, 78, 137];

// ---------------------------------------------------------------- panels
function panel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, WHITE);
  rect(x, y, w, h, INK, 2);
}

// ---------------------------------------------------------------- art
function artCIA(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [15, 28, 43]);
  rect(x + 12, y + 12, w - 24, h - 24, [44, 74, 104], 2);
  const cx = x + w / 2;
  // warning triangle
  fillTriangle(cx, y + 26, cx - 48, y + 108, cx + 48, y + 108, [232, 180, 0]);
  fillRect(cx - 4, y + 52, 8, 30, INK);
  fillRect(cx - 4, y + 88, 8, 8, INK);
  // code bars
  const bars = [200, 260, 170, 240, 290, 150];
  bars.forEach((bw, i) => {
    fillRect(x + 28, y + 128 + i * 16, bw, 7, i % 2 ? [61, 220, 132] : [120, 200, 255]);
  });
  // red breach strip
  fillRect(x + 12, y + h - 44, w - 24, 30, RED);
  drawTextCentered('BREACH', cx, y + h - 38, 2, WHITE);
}

function artChip(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [20, 32, 46]);
  const chipX = x + 28;
  const chipY = y + 20;
  const chipW = 170;
  const chipH = 64;
  // pins
  for (let i = 0; i < 5; i++) {
    fillRect(chipX + 16 + i * 30, chipY - 10, 10, 10, GOLD);
    fillRect(chipX + 16 + i * 30, chipY + chipH, 10, 10, GOLD);
    fillRect(chipX - 10, chipY + 10 + i * 11, 10, 6, GOLD);
    fillRect(chipX + chipW, chipY + 10 + i * 11, 10, 6, GOLD);
  }
  fillRect(chipX, chipY, chipW, chipH, [31, 58, 95]);
  rect(chipX, chipY, chipW, chipH, GOLD, 3);
  drawTextCentered('5G', chipX + chipW / 2, chipY + 21, 3, GOLD);
  // red GUILTY stamp
  const sx = x + w - 150;
  const sy = y + 22;
  rect(sx, sy, 128, 60, RED, 3);
  drawTextCentered('GUILTY', sx + 64, sy + 12, 2, RED);
  drawTextCentered('10 OF 12', sx + 64, sy + 34, 2, RED);
}

function artShip(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  fillRect(x, y + 62, w, h - 62, SEA);
  // drone, top left of the blast
  const dx = x + 300;
  const dy = y + 20;
  fillRect(dx - 16, dy - 3, 32, 6, INK);
  fillRect(dx - 3, dy - 14, 6, 28, INK);
  disc(dx - 18, dy - 14, 4, INK);
  disc(dx + 18, dy - 14, 4, INK);
  // explosion starburst right above the ship's midsection
  const ex = x + 200;
  const ey = y + 36;
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    const tx = Math.round(ex + 30 * Math.cos(rad));
    const ty = Math.round(ey + 30 * Math.sin(rad));
    line(ex, ey, tx, ty, [255, 140, 0]);
    line(ex, ey, Math.round(ex + 18 * Math.cos(rad + 0.4)), Math.round(ey + 18 * Math.sin(rad + 0.4)), [255, 200, 0]);
  }
  disc(ex, ey, 11, [255, 170, 0]);
  disc(ex, ey, 5, [255, 230, 120]);
  // ship hull
  const hx = x + 60;
  const hy = y + 66;
  fillRect(hx, hy, 220, 22, [52, 58, 64]);
  fillTriangle(hx + 220, hy, hx + 252, hy, hx + 220, hy + 22, [52, 58, 64]);
  fillRect(hx + 30, hy - 26, 120, 26, [90, 96, 104]);
  line(hx + 90, hy - 52, hx + 90, hy - 26, INK);
  fillTriangle(hx + 90, hy - 52, hx + 118, hy - 44, hx + 90, hy - 38, RED);
  // waves
  for (let i = 0; i < 4; i++) {
    fillRect(x + 24 + i * 110, y + h - 14, 56, 4, [220, 235, 245]);
  }
}

function artTower(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [223, 233, 242]);
  const tx = x + w / 2 - 23;
  // tower with pointed top
  fillRect(tx, y + 26, 46, h - 26, [43, 58, 74]);
  fillTriangle(tx, y + 26, tx + 46, y + 26, tx + 23, y + 6, [43, 58, 74]);
  // arch slot near the top (Kingdom Centre style)
  fillRect(tx + 18, y + 34, 10, 26, [223, 233, 242]);
  // lit windows
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      fillRect(tx + 8 + c * 24, y + 66 + r * 8, 6, 4, [255, 210, 90]);
    }
  }
  // smoke + burst
  disc(x + w - 52, y + 14, 12, [120, 120, 118]);
  disc(x + w - 72, y + 22, 9, [150, 150, 148]);
  disc(x + w - 40, y + 30, 8, [255, 140, 0]);
  disc(x + w - 40, y + 30, 4, [255, 220, 120]);
}

function artWHO(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, TEAL);
  const cx = x + w / 2;
  const cy = y + h / 2 - 6;
  // white medical cross
  fillRect(cx - 12, cy - 26, 24, 52, WHITE);
  fillRect(cx - 26, cy - 12, 52, 24, WHITE);
  // heartbeat line across the bottom
  const by = y + h - 14;
  line(x + 14, by, x + 70, by, WHITE);
  line(x + 70, by, x + 92, by - 12, WHITE);
  line(x + 92, by - 12, x + 114, by + 8, WHITE);
  line(x + 114, by + 8, x + 136, by - 16, WHITE);
  line(x + 136, by - 16, x + 158, by, WHITE);
  line(x + 158, by, x + w - 14, by, WHITE);
}

function artMedal(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [28, 43, 69]);
  const cx = x + w / 2;
  // ribbon stripes
  fillRect(cx - 30, y + 4, 20, 26, RED);
  fillRect(cx - 10, y + 4, 20, 26, WHITE);
  fillRect(cx + 10, y + 4, 20, 26, [40, 90, 180]);
  // gold medal
  disc(cx, y + 56, 24, GOLD);
  ring(cx, y + 56, 24, [180, 130, 30], 2);
  ring(cx, y + 56, 17, [180, 130, 30], 2);
  // star as a diamond
  fillTriangle(cx, y + 42, cx + 8, y + 56, cx, y + 70, [138, 109, 31]);
  fillTriangle(cx - 8, y + 56, cx, y + 42, cx, y + 70, [138, 109, 31]);
}

// ---------------------------------------------------------------- build
function build(): void {
  fillRect(0, 0, W, H, PAPER);

  // masthead
  fillRect(0, 0, W, 110, NAVY);
  drawTextCentered('THE WORLD IN ONE DAY', W / 2, 18, 5, WHITE);
  drawTextCentered('WEDNESDAY 25 NOVEMBER 2026', W / 2, 64, 3, [200, 210, 225]);
  fillRect(0, 110, W, 6, RED);

  // lead story: CIA cyberattack
  panel(16, 128, 992, 288);
  artCIA(30, 142, 352, 260);
  drawText('LEAD STORY - CYBERATTACK', 402, 146, 2, RED);
  drawText('CIA HIT BY', 402, 182, 5, INK);
  drawText('CYBERATTACK', 402, 224, 5, INK);
  drawPara(
    'THE CIA AND THE OFFICE OF THE DIRECTOR OF NATIONAL INTELLIGENCE WERE HIT BY A CYBERATTACK, SOURCES SAY - THE LATEST IN A STRING OF US GOVERNMENT SYSTEM BREAKDOWNS.',
    402, 276, 590, 2, INK, 20,
  );
  drawText('REPORTED BY CNN AND REUTERS', 402, 380, 2, GREY);

  // row 2: Huawei + Ukraine ship
  panel(16, 428, 484, 252);
  artChip(30, 442, 456, 104);
  drawText('HUAWEI FOUND GUILTY', 30, 560, 3, INK);
  drawPara(
    'A US JURY CONVICTS THE CHINESE TELECOM GIANT OF STEALING TRADE SECRETS AND BANK FRAUD AFTER A THREE-MONTH TRIAL IN NEW YORK.',
    30, 592, 456, 2, INK, 20,
  );

  panel(524, 428, 484, 252);
  artShip(538, 442, 456, 104);
  drawText('KYIV HIT RUSSIAN SHIP', 538, 560, 3, INK);
  drawPara(
    'ZELENSKIY CONFIRMS A DRONE STRIKE ON A RUSSIAN CARGO SHIP IN THE GULF OF FINLAND. NORWAY URGES CAUTION.',
    538, 592, 456, 2, INK, 20,
  );

  // row 3: Riyadh tower, WHO/DRC, Giuliani medal
  panel(16, 692, 320, 216);
  artTower(28, 704, 296, 80);
  drawText('HOUTHIS HIT', 28, 796, 3, INK);
  drawText('RIYADH TOWER', 28, 820, 3, INK);
  drawPara('DRONE STRIKE WOUNDS 11 IN THE CAPITAL.', 28, 856, 296, 2, INK, 20);

  panel(352, 692, 320, 216);
  artWHO(364, 704, 296, 80);
  drawText('WHO FLEES EBOLA', 364, 796, 3, INK);
  drawText('HOSPITAL IN DRC', 364, 820, 3, INK);
  drawPara('HEALTH WORKERS EVACUATED AS FIGHTING RAGES.', 364, 856, 296, 2, INK, 20);

  panel(688, 692, 320, 216);
  artMedal(700, 704, 296, 80);
  drawText('GIULIANI GETS', 700, 796, 3, INK);
  drawText('MEDAL OF FREEDOM', 700, 820, 3, INK);
  drawPara('TRUMP HONOURS EX-MAYOR AT THE WHITE HOUSE.', 700, 856, 296, 2, INK, 20);

  // footer ticker
  fillRect(0, 920, W, 4, RED);
  drawText('ALSO: TRUMP SPARES THANKSGIVING TURKEYS FREEDOM AND FEATHERS', 16, 936, 2, INK);
  drawText('NATO JETS TO POLAND - GTA 6 TOPS CHARTS - ENGLAND LEVEL T20 - SHENZHOU-24 FLIES', 16, 960, 2, INK);
  drawTextCentered('SOURCES: REUTERS - CNN - BBC - AP - 25 NOVEMBER 2026', W / 2, 992, 2, GREY);
}

build();
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'entry.png'), encodePNG(pix));
