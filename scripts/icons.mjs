/**
 * Generates PNG app icons (PWA, Apple touch, maskable) from an SVG master.
 * Usage: node scripts/icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2c2c2e"/><stop offset="1" stop-color="#000"/>
    </linearGradient>
    <radialGradient id="h" cx="0.3" cy="0.2" r="0.9">
      <stop offset="0" stop-color="#0a84ff" stop-opacity="0.35"/><stop offset="1" stop-color="#0a84ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#h)"/>
  <g transform="translate(256 270) scale(${pad ? 0.72 : 1}) translate(-256 -270)" stroke="#fff" stroke-linecap="round">
    <path d="M168 216v196M256 216v196M344 216v196" stroke-width="40"/>
    <path d="M152 144h88M272 144h88" stroke-width="36"/>
  </g>
  <circle cx="${pad ? 380 : 408}" cy="${pad ? 132 : 104}" r="${pad ? 28 : 40}" fill="#ff375f"/>
</svg>`

await mkdir('public/icons', { recursive: true })
const out = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]
for (const [name, size, pad] of out) {
  const png = await sharp(Buffer.from(mark(pad))).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(`public/icons/${name}`, png)
  console.log('wrote', name, png.length, 'bytes')
}
