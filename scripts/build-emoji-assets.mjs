// Copies the emoji pictures the app uses into public/emoji3d, so they are served from our own site.
// Usage: node scripts/build-emoji-assets.mjs <3d-assets-dir> <animated-assets-dir> [<animated-assets-dir> ...]
// Sources: npm packages @lobehub/fluent-emoji-3d and @lobehub/fluent-emoji-anim-1..4 (MIT, Microsoft Fluent Emoji).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir3d, ...animDirs] = process.argv.slice(2);
if (!dir3d || animDirs.length === 0) {
  console.error('Usage: node scripts/build-emoji-assets.mjs <3d-dir> <anim-dir> [...]');
  process.exit(1);
}
const compact = JSON.parse(readFileSync('node_modules/emojibase-data/en/compact.json', 'utf8'));

// Emoji that move. Chosen for being the ones people send most, and kept small in total.
const ANIMATED = [...(
  '😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😛😜🤪😎🤩🥳😏😒😞😔😢😭😤😠😡🤯😱😨😰🥹🤗🤔🤭🤫🙄😬😴😷🥶🥵🥺😳😈👻💩🤡' +
  '❤️🧡💛💚💙💜🖤💔💕💞💓💗💖💘💝👍👎👏🙌👋🤝🙏💪🔥✨🎉🎊🌹🌸⭐🌟💯🌙🎂🎁☕🍺🥂🐶🐱🦄🌈💋🫶🫠'
)].reduce((acc, ch) => {
  // keep multi-code-point emoji (such as the red heart) together
  if (ch === '️') acc[acc.length - 1] += ch;
  else acc.push(ch);
  return acc;
}, []);

const MAX_ANIMATED_BYTES = 380_000;
const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16).padStart(4, '0')).join('-');
const find = (dirs, code) => {
  const strip = code.replace(/-fe0f/g, '');
  for (const d of dirs) for (const c of [code, strip, `${strip}-fe0f`]) {
    const f = join(d, `${c}.webp`);
    if (existsSync(f)) return f;
  }
  return null;
};

const out = 'public/emoji3d';
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 's'), { recursive: true });
mkdirSync(join(out, 'a'), { recursive: true });

const still = {}; // emoji -> file stem
let stillBytes = 0;
for (const e of compact) {
  if (e.group === undefined || e.group === 2) continue;
  const src = find([dir3d], e.hexcode.toLowerCase().replace(/-/g, '-'));
  if (!src) continue;
  const stem = hex(e.unicode);
  copyFileSync(src, join(out, 's', `${stem}.webp`));
  stillBytes += statSync(src).size;
  still[e.unicode] = stem;
}
const moving = {};
let movingBytes = 0;
for (const e of ANIMATED) {
  const stem = hex(e);
  const src = find(animDirs, stem);
  if (!src) {
    console.warn('no animation for', e, stem);
    continue;
  }
  if (statSync(src).size > MAX_ANIMATED_BYTES) continue; // keeps the site light
  copyFileSync(src, join(out, 'a', `${stem}.webp`));
  movingBytes += statSync(src).size;
  moving[e] = stem;
}
// A small index: which emoji have a picture, and which of them move.
const stems = (m) => [...new Set(Object.values(m))];
writeFileSync(
  join('src/emoji', 'assets.json'),
  JSON.stringify({ s: stems(still), a: stems(moving) }),
);
writeFileSync(
  join(out, 'NOTICE.txt'),
  `Emoji pictures: Microsoft Fluent Emoji (3D and animated), MIT licence, Copyright (c) Microsoft Corporation.
Obtained from the npm packages @lobehub/fluent-emoji-3d and @lobehub/fluent-emoji-anim-1 to -4 (MIT).
Source: https://github.com/microsoft/fluentui-emoji and https://github.com/lobehub/fluent-emoji

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
);
console.log(`still: ${stems(still).length} files, ${(stillBytes / 1e6).toFixed(1)} MB; animated: ${stems(moving).length} files, ${(movingBytes / 1e6).toFixed(1)} MB`);
