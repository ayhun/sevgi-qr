import jsQR from 'jsqr';
import { renderDesign, rasterize } from './design.js';
import { designControls } from './design-controls.js';
import { buildPayload } from './payload.js';
import './style.css';
import './account.js';

const icons = {
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/>',
  call: '<path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 2-2 3-4 2C9 19 5 15 3 7c-1-2 0-4 2-4Z"/>',
  sms: '<path d="M4 4h16v13H9l-5 4V4Z"/><path d="M8 9h8M8 12h5"/>',
  vcard: '<rect x="2" y="4" width="20" height="16" rx="1"/><circle cx="8" cy="10" r="2"/><path d="M4 17c0-4 8-4 8 0M15 9h4M15 13h4"/>',
  whatsapp: '<path d="M21 11a9 9 0 0 1-13 8l-5 2 1-5A9 9 0 1 1 21 11Z"/><path d="M8 7c0 5 3 8 7 8l1-2-3-1-1 1-2-3 1-1-1-2H8Z"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>'
};
// Field definitions contain only developer-authored strings. User content is
// always assigned via value/textContent, never interpolated into HTML.
const field = (name, label, placeholder = '', extra = {}) => ({ name, label, placeholder, ...extra });
const phoneField = field('phone', 'Phone number', '+49 151 23456789', { type: 'tel' });
const messageField = field('message', 'Message', 'Write a message…', { type: 'textarea', optional: true });
const types = {
  link: { name: 'Link', title: 'Website link', description: 'Send someone straight to a website, paper, or shared document.', note: 'The destination must be accessible to the person scanning.', fields: [field('url', 'Website address', 'https://example.com', { type: 'url' })] },
  text: { name: 'Text', title: 'A few words', description: 'Share a note, a reference, or any plain text.', note: 'Shorter content makes a simpler, easier-to-scan code.', fields: [field('text', 'Your text', 'What would you like to share?', { type: 'textarea' })] },
  email: { name: 'Email', title: 'Start an email', description: 'Open an email draft with the recipient and message filled in.', note: 'The person scanning chooses whether to send it.', fields: [field('email', 'Email address', 'hello@example.com', { type: 'email' }), field('subject', 'Subject', 'A quick question', { optional: true }), field('body', 'Message', 'Hello…', { type: 'textarea', optional: true })] },
  call: { name: 'Call', title: 'Make a connection', description: 'Open a phone number in the dialer.', note: 'Include the country code for international use.', fields: [phoneField] },
  sms: { name: 'SMS', title: 'Send a text', description: 'Prepare a text message to a phone number.', note: 'The person scanning confirms sending. Carrier charges may apply.', fields: [phoneField, messageField] },
  vcard: { name: 'vCard', title: 'Share a contact', description: 'Create a contact card that can be added to an address book.', note: 'Add only the contact details you want to share.', fields: [field('first', 'First name', 'Sevgi', { half: true, optional: true }), field('last', 'Last name', 'Kafali', { half: true, optional: true }), field('organization', 'Organization', 'University or organization', { optional: true }), field('title', 'Role', 'Research scientist', { optional: true }), { ...phoneField, optional: true }, field('email', 'Email address', 'hello@example.com', { type: 'email', optional: true }), field('url', 'Website', 'https://example.com', { type: 'url', optional: true }), field('street', 'Street address', '', { optional: true }), field('city', 'City', '', { half: true, optional: true }), field('region', 'State / region', '', { half: true, optional: true }), field('postal', 'Postal code', '', { half: true, optional: true }), field('country', 'Country', '', { half: true, optional: true })] },
  whatsapp: { name: 'WhatsApp', title: 'Start a conversation', description: 'Open a WhatsApp chat with an optional first message.', note: 'Use a WhatsApp number with + and country code, without the local leading zero.', fields: [phoneField, messageField] },
  wifi: { name: 'Wi-Fi', title: 'Share your Wi-Fi', description: 'Let guests join a network with a scan.', note: 'The code contains your Wi-Fi password. Share it only with people you trust.', fields: [field('ssid', 'Network name (SSID)', 'Your exact network name'), field('security', 'Security', '', { type: 'select', options: [['WPA', 'WPA / WPA2 / WPA3 Personal'], ['WEP', 'WEP (legacy)'], ['nopass', 'Open network (no password)']] }), field('password', 'Password', 'Network password', { type: 'password' }), field('hidden', 'Hidden network', '', { type: 'checkbox' })] }
};
const $ = id => document.getElementById(id);
let selected = 'link';
let ink = '#000000';
let revision = 0;
let timer;
let ready = null;
const design = designControls($('design-controls'), () => { ink = design.color; updateColors(); update(); }, icons);
const values = Object.fromEntries(Object.keys(types).map(key => [key, {}]));
values.link.url = new URLSearchParams(location.search).get('managed') || 'https://sgkafali.com';
values.wifi.security = 'WPA';

for (const [key, type] of Object.entries(types)) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'type-button'; button.dataset.type = key;
  button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[key]}</svg><span>${type.name}</span>`;
  button.addEventListener('click', () => { selected = key; renderFields(); update(); });
  $('types').append(button);
}
for (const [color, name] of [['#000000', 'Black'], ['#18231f', 'Charcoal'], ['#203e66', 'Navy'], ['#1d5849', 'Forest'], ['#115e59', 'Teal'], ['#1e40af', 'Blue'], ['#4338ca', 'Indigo'], ['#6b21a8', 'Purple'], ['#9d174d', 'Berry'], ['#991b1b', 'Red'], ['#9a3412', 'Rust'], ['#713f12', 'Brown']]) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'swatch'; button.style.background = color;
  button.setAttribute('aria-label', name); button.title = name; button.dataset.color = color; button.innerHTML = '<span aria-hidden="true"></span>';
  button.addEventListener('click', () => { ink = color; design.color = color; $('design-color').value = color; updateColors(); update(); });
  $('colors').append(button);
}
function updateColors() {
  for (const button of $('colors').children) { const active = button.dataset.color === ink; button.setAttribute('aria-pressed', String(active)); button.firstChild.textContent = active ? '✓' : ''; }
}
function renderFields() {
  const type = types[selected];
  $('form-title').textContent = type.title; $('form-description').textContent = type.description;
  $('type-note').textContent = type.note; $('preview-type').textContent = type.name.toUpperCase();
  if (selected === 'wifi' && values.wifi.security === 'nopass') $('type-note').textContent = 'This is an open network. No password is included in the code.';
  $('encoded-details').open = false;
  for (const button of $('types').children) button.setAttribute('aria-pressed', String(button.dataset.type === selected));
  $('fields').replaceChildren();
  for (const definition of type.fields) {
    if (selected === 'wifi' && definition.name === 'password' && values.wifi.security === 'nopass') continue;
    const wrapper = document.createElement('div'); wrapper.className = `field${definition.half ? '' : ' full'}`;
    const label = document.createElement('label'); label.htmlFor = `field-${definition.name}`;
    label.textContent = definition.label;
    if (definition.optional) { const optional = document.createElement('span'); optional.className = 'optional'; optional.textContent = ' (optional)'; label.append(optional); }
    const input = document.createElement(definition.type === 'textarea' ? 'textarea' : definition.type === 'select' ? 'select' : 'input');
    input.id = label.htmlFor; input.name = definition.name;
    if (input.tagName === 'INPUT') input.type = definition.type || 'text';
    input.autocomplete = 'off';
    if (definition.placeholder) input.placeholder = definition.placeholder;
    if (input.tagName !== 'SELECT' && input.type !== 'checkbox') input.maxLength = 2000;
    input.setAttribute('aria-describedby', 'type-note status');
    if (definition.options) for (const [value, text] of definition.options) { const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option); }
    if (definition.type === 'checkbox') { input.checked = Boolean(values[selected][definition.name]); label.className = 'check-label'; label.prepend(input); wrapper.append(label); }
    else {
      input.value = values[selected][definition.name] || '';
      wrapper.append(label);
      if (definition.type === 'password') {
        const row = document.createElement('div'); row.className = 'password-wrap';
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'password-toggle'; toggle.textContent = 'Show'; toggle.setAttribute('aria-label', 'Show Wi-Fi password');
        toggle.addEventListener('click', () => { const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password'; toggle.textContent = reveal ? 'Hide' : 'Show'; toggle.setAttribute('aria-label', `${reveal ? 'Hide' : 'Show'} Wi-Fi password`); });
        row.append(input, toggle); wrapper.append(row);
      } else wrapper.append(input);
    }
    input.addEventListener('input', () => {
      values[selected][definition.name] = definition.type === 'checkbox' ? input.checked : input.value;
      if (selected === 'wifi' && definition.name === 'security') { renderFields(); $('field-security').focus(); }
      invalidate(); clearTimeout(timer); timer = setTimeout(update, 180);
    });
    $('fields').append(wrapper);
  }
}
function invalidate() {
  revision++; ready = null;
  $('download-png').disabled = $('download-svg').disabled = $('copy').disabled = true;
  $('qr-canvas').hidden = true; $('empty-preview').hidden = false;
  $('encoded').textContent = ''; $('status').textContent = 'Updating preview…'; $('status').className = 'status';
}
async function update() {
  clearTimeout(timer); invalidate(); const current = revision;
  if (design.logo) $('correction').value = 'H';
  $('correction').disabled = Boolean(design.logo);
  try {
    const payload = buildPayload(selected, values[selected]);
    const { svg, width, height } = renderDesign(payload, design, $('correction').value);
    const size = Number($('size').value);
    const canvas = await rasterize(svg, size, Math.round(size * height / width));
    if (current !== revision) return;
    const preview = $('qr-canvas'); preview.width = canvas.width; preview.height = canvas.height;
    preview.getContext('2d').drawImage(canvas, 0, 0);
    preview.hidden = false; $('empty-preview').hidden = true;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(pixels.data, canvas.width, canvas.height);
    if (!decoded || decoded.data !== payload) throw new Error('Scan check failed. Try darker ink, a lighter background, simpler shapes, or remove the logo.');
    ready = { payload, svg, canvas, type: selected };
    $('encoded').textContent = payload;
    $('status').textContent = 'Scan check passed · ready to download';
    $('download-png').disabled = $('download-svg').disabled = $('copy').disabled = false;
  } catch (error) {
    if (current !== revision) return;
    $('status').textContent = /amount of data|code length|too big/i.test(error.message) ? 'Too much content for one QR code. Shorten it or lower error correction.' : error.message;
    $('status').className = 'status error';
  }
}
function download(blob, extension, type) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `qr-${type}.${extension}`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('download-png').addEventListener('click', () => { const result = ready; if (result) result.canvas.toBlob(blob => { if (blob) download(blob, 'png', result.type); }, 'image/png'); });
$('download-svg').addEventListener('click', () => { if (ready) download(new Blob([ready.svg], { type: 'image/svg+xml' }), 'svg', ready.type); });
$('copy').addEventListener('click', async () => { if (!ready) return; try { await navigator.clipboard.writeText(ready.payload); $('status').textContent = 'Encoded content copied.'; } catch { $('status').textContent = 'Copy unavailable. Select and copy the content below.'; } });
$('clear').addEventListener('click', () => { values[selected] = selected === 'wifi' ? { security: 'WPA' } : {}; renderFields(); update(); $('fields').querySelector('input,textarea,select')?.focus(); });
for (const id of ['size', 'correction']) $(id).addEventListener('change', update);
$('qr-form').addEventListener('submit', event => { event.preventDefault(); update(); });
$('year').textContent = new Date().getFullYear();
renderFields(); updateColors(); update();
