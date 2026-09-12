// Converts locally cached, Apache-2.0 AOSP resources to browser-native data.
// See src/games/landroid-extended/README.md for the pinned upstream sources.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = 'src/games/landroid-extended';
mkdirSync(out, { recursive: true });
const notice = `/* Copyright (C) 2023–2026 The Android Open Source Project.
 * Licensed under Apache-2.0; see public/licenses/landroid-extended.txt.
 * Modified: extracted from Android 17 Kotlin/XML to TypeScript data. */\n`;
const art = readFileSync('.cache/android-aosp/17/Assets.kt', 'utf8');
const paths = {};
for (const match of art.matchAll(
  /val (\w+)\s*=\s*Path\(\)\.apply\s*\{[\s\S]*?parseSvgPathData\(\s*"""([\s\S]*?)"""/g,
)) {
  paths[match[1]] = match[2].trim().replace(/\s+/g, ' ');
}
const textureOrder = art
  .match(/val planetTextures = arrayOf\(([\s\S]*?)\)/)[1]
  .match(/texture_\w+/g);
writeFileSync(
  `${out}/art.ts`,
  notice +
    `export const shipPath = ${JSON.stringify(paths.spaceshipPath)};\nexport const legsPath = ${JSON.stringify(paths.spaceshipLegs)};\nexport const planetTextures: readonly string[] = ${JSON.stringify(
      textureOrder.map((key) => paths[key]),
      null,
      2,
    )};\n`,
);
const xml = readFileSync('.cache/android-aosp/17/landroid_strings.xml', 'utf8');
const words = {};
for (const match of xml.matchAll(
  /<string-array name="([^"]+)"[^>]*>([\s\S]*?)<\/string-array>/g,
)) {
  words[match[1]] = [...match[2].matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
    (m) =>
      m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  );
}
writeFileSync(
  `${out}/words.ts`,
  notice + `export const words = ${JSON.stringify(words, null, 2)} as const;\n`,
);
console.log(
  `Imported ${Object.keys(paths).length} vector paths and ${Object.keys(words).length} word bags.`,
);
