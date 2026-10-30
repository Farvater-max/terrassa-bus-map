import { unzipSync } from 'fflate';

function fixEncoding(value) {
  if ([...value].some(char => char.charCodeAt(0) > 255)) return value;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(value, char => char.charCodeAt(0)),
    );
  } catch {
    return value;
  }
}

export function tidy(value) {
  return [['dÈgara', "d'Egara"], ['dEgara', "d'Egara"], ['NAurell', "N'Aurell"]]
    .reduce((text, [from, to]) => text.replaceAll(from, to), fixEncoding(value));
}

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(value => value.trim());
  return rows.filter(value => value.length > 1)
    .map(value => Object.fromEntries(headers.map((header, i) => [header, value[i] ?? ''])));
}

export function openZip(raw) {
  const files = unzipSync(raw);
  const decoder = new TextDecoder('utf-8');
  return name => {
    const key = Object.keys(files).find(file => file.endsWith(`${name}.txt`));
    return key ? parseCSV(decoder.decode(files[key])) : [];
  };
}
