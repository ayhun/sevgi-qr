const required = (value, label) => {
  if (!String(value ?? '').trim()) throw new Error(`Enter ${label}.`);
  return String(value);
};
export function webUrl(value) {
  let text = required(value, 'a website address').trim();
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) text = `https://${text}`;
  let url;
  try { url = new URL(text); } catch { throw new Error('Enter a valid website address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
    throw new Error('Use an http:// or https:// website address without login credentials.');
  }
  return url.href;
}
const email = value => {
  const text = required(value, 'an email address').trim();
  if (!/^[^\s@?&#,;:]+@[^\s@?&#,;:]+\.[^\s@?&#,;:]+$/.test(text)) throw new Error('Enter one valid email address.');
  return text;
};
const phone = value => {
  const text = required(value, 'a phone number').trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d{3,15}$/.test(text)) throw new Error('Enter a phone number using digits and an optional + country code.');
  return text;
};
const wifiEscape = value => String(value ?? '').replace(/[\\;,:\"]/g, '\\$&');
const cardEscape = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[;,]/g, '\\$&');

export function buildPayload(type, data) {
  switch (type) {
    case 'link': return webUrl(data.url);
    case 'text': return required(data.text, 'some text');
    case 'email': {
      const address = email(data.email);
      const query = [['subject', data.subject], ['body', data.body]].filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      return `mailto:${address}${query ? `?${query}` : ''}`;
    }
    case 'call': return `tel:${phone(data.phone)}`;
    case 'sms': return `SMSTO:${phone(data.phone)}:${data.message || ''}`;
    case 'whatsapp': {
      const number = phone(data.phone);
      if (!/^\+[1-9]\d{6,14}$/.test(number)) throw new Error('Use the full WhatsApp number with + and country code.');
      return `https://wa.me/${number.slice(1)}${data.message ? `?text=${encodeURIComponent(data.message)}` : ''}`;
    }
    case 'wifi': {
      const ssid = required(data.ssid, 'the network name');
      if (new TextEncoder().encode(ssid).length > 32) throw new Error('A Wi-Fi network name must be at most 32 bytes.');
      const security = data.security || 'WPA';
      if (!['WPA', 'WEP', 'nopass'].includes(security)) throw new Error('Choose a supported Wi-Fi security type.');
      const password = security === 'nopass' ? '' : required(data.password, 'the Wi-Fi password');
      return `WIFI:T:${security};S:${wifiEscape(ssid)};P:${wifiEscape(password)};H:${Boolean(data.hidden)};;`;
    }
    case 'vcard': {
      if (!data.first?.trim() && !data.last?.trim()) throw new Error('Enter a first or last name.');
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${cardEscape(data.last)};${cardEscape(data.first)};;;`, `FN:${cardEscape([data.first, data.last].filter(Boolean).join(' '))}`];
      if (data.organization) lines.push(`ORG:${cardEscape(data.organization)}`);
      if (data.title) lines.push(`TITLE:${cardEscape(data.title)}`);
      if (data.phone) lines.push(`TEL;TYPE=CELL:${phone(data.phone)}`);
      if (data.email) lines.push(`EMAIL:${email(data.email)}`);
      if (data.url) lines.push(`URL:${cardEscape(webUrl(data.url))}`);
      if ([data.street, data.city, data.region, data.postal, data.country].some(Boolean)) lines.push(`ADR;TYPE=WORK:;;${[data.street, data.city, data.region, data.postal, data.country].map(cardEscape).join(';')}`);
      lines.push('END:VCARD');
      return lines.join('\r\n');
    }
    default: throw new Error('Choose a QR code type.');
  }
}
