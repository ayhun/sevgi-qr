import QRCode from 'qrcode';

export const defaults = { frame: 'none', caption: 'SCAN ME', font: 'sans-serif', frameColor: '#1d5849', shape: 'square', eye: 'square', background: '#ffffff', color: '#1d5849', logo: '', clearLogo: true };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const rect = (x, y, w, h, color, radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${color}"/>`;

export function renderDesign(payload, design = {}, correction = 'M') {
  const d = { ...defaults, ...design };
  for (const key of ['color', 'background', 'frameColor']) if (!/^#[\da-f]{6}$/i.test(d[key])) throw new Error('Choose a valid six-digit color.');
  const qr = QRCode.create(payload, { errorCorrectionLevel: d.logo ? 'H' : correction });
  const n = qr.modules.size, unit = 10, box = (n + 8) * unit;
  const framed = d.frame !== 'none', pad = framed ? 14 : 0;
  const top = d.frame === 'top' ? 64 : d.frame === 'phone' ? 40 : 0;
  const bottom = framed && d.frame !== 'top' ? 64 : 0;
  const width = box + pad * 2, height = box + pad * 2 + top + bottom;
  let svg = rect(0, 0, width, height, d.background);
  if (framed) svg += rect(2, 2, width - 4, height - 4, d.frameColor, d.frame === 'phone' ? 30 : 14);
  svg += rect(pad, pad + top, box, box, d.background, framed ? 6 : 0);
  const ox = pad + 40, oy = pad + top + 40;
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.modules.get(r, c) || finder(r, c)) continue;
    const x = ox + c * unit, y = oy + r * unit;
    const shape = qr.modules.isReserved(r, c) ? 'square' : d.shape;
    svg += shape === 'dots' ? `<circle cx="${x + 5}" cy="${y + 5}" r="5" fill="${d.color}"/>` : rect(x, y, 10, 10, d.color, shape === 'rounded' ? 3 : 0);
  }
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = ox + c * unit, y = oy + r * unit, rounded = d.eye === 'rounded';
    svg += rect(x, y, 70, 70, d.color, rounded ? 16 : 0) + rect(x + 10, y + 10, 50, 50, d.background, rounded ? 9 : 0) + rect(x + 20, y + 20, 30, 30, d.color, rounded ? 7 : 0);
  }
  if (d.logo) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.logo)) throw new Error('Logo must be a locally processed PNG.');
    const size = n * unit * .17, x = ox + (n * unit - size) / 2, y = oy + (n * unit - size) / 2;
    if (d.clearLogo) svg += rect(x - 4, y - 4, size + 8, size + 8, d.background, 4);
    svg += `<image href="${d.logo}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
  }
  if (d.frame === 'phone') svg += rect(width / 2 - 22, 18, 44, 5, '#ffffff', 3);
  if (framed) {
    const y = d.frame === 'top' ? 43 : height - 27;
    const font = ['sans-serif', 'serif', 'monospace'].includes(d.font) ? d.font : 'sans-serif';
    const phrase = Array.from(d.caption).slice(0, 40).join('');
    const fontSize = Math.min(24, (width - 36) / Math.max(Array.from(phrase).length * .7, 1));
    svg += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${fontSize}" fill="#ffffff">${escape(phrase)}</text>`;
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svg}</svg>`, width, height };
}

export async function rasterize(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height); return canvas;
  } finally { URL.revokeObjectURL(url); }
}
