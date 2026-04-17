// scripts/generate-icons.mjs
// Generates icon PNGs using canvas (requires canvas npm package or node --experimental-vm-modules)
// Run: node scripts/generate-icons.mjs

import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#6c63ff";
  ctx.fill();

  // Inner circle (ring bg)
  const innerR = r * 0.72;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1d27";
  ctx.fill();

  // Progress arc (75%)
  ctx.beginPath();
  ctx.arc(cx, cy, innerR - size * 0.06, -Math.PI / 2, Math.PI * 1);
  ctx.strokeStyle = "#6c63ff";
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#6c63ff";
  ctx.fill();

  return canvas.toBuffer("image/png");
}

for (const size of [16, 48, 128]) {
  const buf = drawIcon(size);
  const out = join(outDir, `icon${size}.png`);
  writeFileSync(out, buf);
  console.log(`Written: ${out}`);
}
