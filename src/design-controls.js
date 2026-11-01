import { defaults } from './design.js';

export function designControls(host, onChange, icons) {
  const state = { ...defaults };
  host.innerHTML = `<div class="design-tabs" aria-label="Design categories"></div><div class="design-panels"></div><button type="button" class="text-button" id="reset-design">Reset design</button>`;
  const panels = {};
  for (const category of ['Frame', 'Shape', 'Logo']) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = category;
    button.setAttribute('aria-pressed', String(category === 'Frame'));
    const panel = document.createElement('div'); panel.className = 'design-panel'; panel.hidden = category !== 'Frame'; panels[category] = panel;
    button.addEventListener('click', () => {
      for (const child of host.querySelector('.design-tabs').children) child.setAttribute('aria-pressed', String(child === button));
      for (const [key, value] of Object.entries(panels)) value.hidden = key !== category;
    });
    host.querySelector('.design-tabs').append(button); host.querySelector('.design-panels').append(panel);
  }
  const controls = [];
  function control(category, key, label, options, type = 'select') {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    input.id = `design-${key}`;
    if (type !== 'select') input.type = type;
    if (options) for (const [value, text] of options) input.add(new Option(text, value));
    input.value = state[key]; if (type === 'checkbox') input.checked = state[key];
    if (key === 'caption') input.maxLength = 40;
    input.addEventListener('input', () => { state[key] = type === 'checkbox' ? input.checked : input.value; if (key === 'color') syncFrameColor(); onChange(); });
    wrapper.append(input); panels[category].append(wrapper); controls.push([input, key]);
  }
  control('Frame', 'frame', 'Frame style', [['none', 'No frame'], ['bottom', 'Caption below'], ['top', 'Caption above'], ['phone', 'Phone']]);
  control('Frame', 'caption', 'Frame phrase', null, 'text');
  control('Frame', 'font', 'Phrase font', [['sans-serif', 'Sans serif'], ['serif', 'Serif'], ['monospace', 'Monospace']]);
  const matchLabel = document.createElement('label'); matchLabel.className = 'frame-match';
  const matchInput = document.createElement('input'); matchInput.type = 'checkbox'; matchInput.checked = state.frameMatchesInk;
  matchInput.id = 'design-frameMatchesInk'; matchLabel.append(matchInput, document.createTextNode('Use ink color for frame'));
  panels.Frame.append(matchLabel);
  matchInput.addEventListener('change', () => { state.frameMatchesInk = matchInput.checked; syncFrameColor(); onChange(); });
  control('Frame', 'frameColor', 'Custom frame color', null, 'color');
  function syncFrameColor() {
    const input = host.querySelector('#design-frameColor');
    input.disabled = state.frameMatchesInk;
    input.value = state.frameMatchesInk ? state.color : state.frameColor;
  }
  syncFrameColor();
  control('Shape', 'shape', 'Module shape', [['square', 'Squares'], ['rounded', 'Rounded'], ['dots', 'Dots']]);
  control('Shape', 'eye', 'Corner shape', [['square', 'Square'], ['rounded', 'Rounded']]);
  control('Shape', 'color', 'QR color', null, 'color');
  control('Shape', 'background', 'Background color', null, 'color');
  const choices = document.createElement('div'); choices.className = 'logo-choices';
  const status = document.createElement('p'); status.className = 'hint'; status.setAttribute('role', 'status');
  let uploadVersion = 0;
  function markLogo(key) { for (const button of choices.children) button.setAttribute('aria-pressed', String(button.dataset.logo === key)); }
  for (const key of ['none', 'link', 'email', 'call', 'wifi', 'vcard']) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.logo = key; button.setAttribute('aria-label', `${key} logo`);
    button.innerHTML = key === 'none' ? 'None' : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[key]}</svg>`;
    button.addEventListener('click', async () => {
      const version = ++uploadVersion;
      if (key === 'none') state.logo = '';
      else {
        const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1d5849"/><g transform="translate(4 4)" fill="none" stroke="white" stroke-width="2">${icons[key]}</g></svg>`;
        const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source); await image.decode();
        if (version !== uploadVersion) return;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; canvas.getContext('2d').drawImage(image, 0, 0, 128, 128); state.logo = canvas.toDataURL();
      }
      markLogo(key); status.textContent = ''; onChange();
    }); choices.append(button);
  }
  panels.Logo.append(choices);
  const upload = document.createElement('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp';
  const label = document.createElement('label'); label.textContent = 'Upload logo (PNG, JPEG or WebP · max 2 MB)'; label.append(upload); panels.Logo.append(label, status);
  upload.addEventListener('change', async () => {
    const file = upload.files[0], version = ++uploadVersion; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { status.textContent = 'Choose a PNG, JPEG or WebP under 2 MB.'; return; }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (version !== uploadVersion) return;
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const scale = 256 / Math.max(image.width, image.height), w = image.width * scale, h = image.height * scale;
      canvas.getContext('2d').drawImage(image, (256 - w) / 2, (256 - h) / 2, w, h);
      state.logo = canvas.toDataURL(); markLogo('upload'); status.textContent = 'Logo processed locally. Nothing was uploaded.'; onChange();
    } catch { status.textContent = 'This image could not be read. Try another file.'; }
    finally { URL.revokeObjectURL(url); }
  });
  control('Logo', 'clearLogo', 'Clear QR modules behind logo', null, 'checkbox');
  const note = document.createElement('p'); note.className = 'hint'; note.textContent = 'Logos use highest error correction automatically. Always test on your phone before printing.'; panels.Logo.append(note);
  host.querySelector('#reset-design').addEventListener('click', () => {
    uploadVersion++; Object.assign(state, defaults); upload.value = ''; status.textContent = ''; markLogo('none');
    for (const [input, key] of controls) { input.value = state[key]; if (input.type === 'checkbox') input.checked = state[key]; }
    matchInput.checked = state.frameMatchesInk; syncFrameColor();
    onChange();
  });
  markLogo('none');
  return state;
}
