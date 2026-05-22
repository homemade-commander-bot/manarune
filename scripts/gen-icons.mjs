// One-off icon generator. Resizes the master app icon (manaruneappicon.png,
// 1254×1254) into the size set the app actually serves. Re-run with:
//   node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "manaruneappicon.png");

mkdirSync(join(root, "public"), { recursive: true });

const jobs = [
  // Header brand mark (served from /public, used at ~28px → render @2x).
  { out: "public/manarune-icon.png", size: 64 },
  // PWA / share-target icons.
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
  // Next App Router conventions (src/app/icon.png → favicon).
  { out: "src/app/icon.png", size: 256 },
  { out: "src/app/apple-icon.png", size: 180 },
];

for (const { out, size } of jobs) {
  await sharp(src).resize(size, size, { fit: "cover" }).png().toFile(join(root, out));
  console.log(`wrote ${out} (${size}×${size})`);
}
