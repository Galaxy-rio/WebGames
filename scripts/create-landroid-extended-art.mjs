// Reuse AOSP paths directly; every transform preserves the original geometry.
import { writeFileSync } from 'node:fs';
import {
  legsPath,
  planetTextures,
  shipPath,
} from '../src/games/landroid-extended/art.ts';

const notice =
  '<!-- AOSP vector paths, Apache-2.0. See /licenses/landroid-extended.txt. -->';
const surface = (x, y, radius) => `
  <circle cx="${x}" cy="${y}" r="${radius}" fill="#16161d"/>
  <g clip-path="url(#planet)">
    <g transform="translate(${x} ${y}) rotate(25) scale(${radius / 64}) translate(-64 -64)">
      <path d="${planetTextures[2]}" fill="none" stroke="#43ffd0" stroke-width=".7" vector-effect="non-scaling-stroke" opacity=".65"/>
    </g>
  </g>
  <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#43ffd0" stroke-width="1.5"/>`;
const point = (x, y, radius, angle) =>
  [
    (x + Math.cos((angle * Math.PI) / 180) * radius).toFixed(3),
    (y + Math.sin((angle * Math.PI) / 180) * radius).toFixed(3),
  ].join(' ');
const flag = (x, y, radius, angle, scale) => `
  <g transform="translate(${point(x, y, radius, angle)}) rotate(${angle}) scale(${scale})" fill="none" stroke="#c6ff00" stroke-width="${1.5 / scale}">
    <path d="M0 0H80M80 0L70 20L60 0Z"/>
  </g>`;
const ship = (x, y, radius, angle, scale) => `
  <g transform="translate(${point(x, y, radius + 11.5 * scale, angle)}) rotate(${angle}) scale(${scale})" stroke-width="${1.5 / scale}">
    <path d="${legsPath}" fill="none" stroke="#cccccc"/>
    <path d="${shipPath}" fill="#16161d" stroke="#ffffff"/>
  </g>`;

writeFileSync(
  'public/images/landroid-extended-background.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  ${notice}
  <defs><clipPath id="planet"><circle cx="1550" cy="1090" r="600"/></clipPath></defs>
  <rect width="1920" height="1080" fill="#16161d"/>
  <path d="M0 170H1920M0 570H1920M0 970H1920M150 0V1080M550 0V1080M950 0V1080M1350 0V1080M1750 0V1080" fill="none" stroke="#292936"/>
  <g fill="none" stroke="#5c1523"><circle cx="1550" cy="1090" r="700"/><circle cx="1550" cy="1090" r="830"/><circle cx="1550" cy="1090" r="1080"/></g>
  <circle cx="400" cy="-2050" r="2850" fill="none" stroke="#3c3c4f"/>
  ${surface(1550, 1090, 600)}
  ${flag(1550, 1090, 600, -114, 3)}
  <path d="M1200 15Q1175 230 ${point(1550, 1090, 634.5, -118)}" fill="none" stroke="#34a853" stroke-width=".8" stroke-dasharray="9 10"/>
  ${ship(1550, 1090, 600, -118, 3)}
</svg>\n`,
);

writeFileSync(
  'public/images/landroid-extended-cover.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${notice}
  <defs><clipPath id="planet"><circle cx="410" cy="385" r="236"/></clipPath></defs>
  <rect width="512" height="512" fill="#16161d"/>
  <path d="M0 100H512M0 300H512M100 0V512M300 0V512" fill="none" stroke="#292936"/>
  <g fill="none" stroke="#801a24"><circle cx="410" cy="385" r="290"/><circle cx="410" cy="385" r="350"/><circle cx="410" cy="385" r="430"/></g>
  ${surface(410, 385, 236)}
  ${flag(410, 385, 236, -132, 1.2)}
  <path d="M43 28Q100 100 ${point(410, 385, 261.3, -140)}" fill="none" stroke="#34a853" stroke-dasharray="9 9"/>
  ${ship(410, 385, 236, -140, 2.2)}
</svg>\n`,
);
console.log(
  'Created contour terrain, radial triangular flags and original ship artwork.',
);
