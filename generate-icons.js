// This script generates placeholder icons for the PWA.
// Run: node generate-icons.js
const fs = require('fs');

function makeSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#007aff"/>
  <text x="${size / 2}" y="${size / 2 + size * 0.25}" text-anchor="middle" font-size="${size * 0.5}" fill="white">📍</text>
</svg>`;
}

for (const s of [192, 512]) {
  fs.writeFileSync(`icon-${s}.png`, `<svg>${makeSVG(s)}</svg>`);
}
console.log('Icons generated (SVG fallbacks)');
