#!/usr/bin/env node
// Собирает index.html с картой автобусов Террассы из GTFS-архивов.
// Запуск: node build_map.mjs [--main URL|файл] [--summer URL|файл] [--no-summer] [--borrow-shapes]
//                            [--template map_template.html] [--app app.js] [--out index.html]
// Без --main сам находит ссылки через CKAN API opendata.terrassa.cat. Нужен Node 18+ и пакет fflate.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const CKAN = 'https://opendata.terrassa.cat/api/3/action/package_show?id=parades-bus';
const FALLBACK = { // актуальный архив из NAP через зеркало Transitland; портал Terrassa блокирует Actions через Cloudflare
  main: 'https://gtfs-source-feeds.transit.land/es-nap-1175.zip',
  summer: 'https://opendata.terrassa.cat/dataset/b3e576c8-481f-4446-bafe-41258f7ec0ae/resource/0002bb95-34cd-4e23-95c0-9c0747d66443/download/gtfs-tmsae_estiu.zip',
};

function parseArgs(argv) {
  const a = { template: 'map_template.html', app: 'app.js', out: 'index.html' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--no-summer') a.noSummer = true;
    else if (k === '--borrow-shapes') a.borrowShapes = true;
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
  }
  return a;
}

async function fetchBytes(src) {
  if (!/^https?:/.test(src)) return new Uint8Array(readFileSync(src));
  // сайты открытых данных часто отдают 403 «ботам», поэтому представляемся обычным браузером
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/zip,application/octet-stream,application/json,text/html;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ca,es;q=0.9,en;q=0.8',
  };
  const r = await fetch(src, { headers, signal: AbortSignal.timeout(120000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} (сервер: ${r.headers.get('server') || '?'}) для ${src}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function discover() {
  const urls = { ...FALLBACK };
  try {
    const res = JSON.parse(new TextDecoder().decode(await fetchBytes(CKAN))).result.resources;
    // CKAN resource for the main feed is still dated 2025-02-04; keep the current NAP mirror above.
    for (const r of res) {
      if (/estiu/i.test((r.name || '') + (r.url || ''))) urls.summer = r.url;
    }
  } catch (e) { console.error('CKAN API недоступен, использую запасные ссылки:', e.message); }
  return urls;
}

// ---------- утилиты ----------
function fix(s) { // лечит двойную кодировку (EstaciÃ³ -> Estació)
  if ([...s].some(c => c.charCodeAt(0) > 255)) return s;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, c => c.charCodeAt(0))); } catch { return s; }
}
const tidy = s => [['dÈgara', "d'Egara"], ['dEgara', "d'Egara"], ['NAurell', "N'Aurell"]]
  .reduce((x, [a, b]) => x.replaceAll(a, b), fix(s));

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  const h = rows.shift().map(s => s.trim());
  return rows.filter(x => x.length > 1).map(x => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ''])));
}

const ts = t => {
  t = (t || '').trim(); if (!t) return null;
  const p = t.split(':'); return +p[0] * 3600 + +p[1] * 60 + (p[2] ? +p[2] : 0);
};
function fill(a) { // заполняет пропуски во времени линейно
  let i = 0;
  while (i < a.length) {
    if (a[i] !== null) { i++; continue; }
    let j = i; while (j < a.length && a[j] === null) j++;
    const lo = i ? a[i - 1] : null, hi = j < a.length ? a[j] : null;
    for (let k = i; k < j; k++) a[k] = lo !== null && hi !== null ? lo + (hi - lo) * (k - i + 1) / (j - i + 1) : (lo ?? hi);
    i = j;
  }
  return a;
}

function openZip(raw) {
  const files = unzipSync(raw), dec = new TextDecoder('utf-8');
  return name => {
    const key = Object.keys(files).find(n => n.endsWith(name + '.txt'));
    return key ? parseCSV(dec.decode(files[key])) : [];
  };
}

// ---------- трассы ----------
function readShapes(raw) {
  const by = new Map();
  for (const r of openZip(raw)('shapes')) {
    if (!by.has(r.shape_id)) by.set(r.shape_id, []);
    by.get(r.shape_id).push([+r.shape_pt_sequence, +r.shape_pt_lat, +r.shape_pt_lon]);
  }
  return [...by.values()].map(v => v.sort((a, b) => a[0] - b[0]).map(([, la, lo]) => [la, lo]));
}

function snap(stopLL, shape, tol = 0.0004) { // привязка остановок к вершинам трассы по порядку
  const idx = []; let j = 0, cost = 0;
  for (const [la, lo] of stopLL) {
    let best = null, bj = j;
    for (let k = j; k < shape.length; k++) {
      const dd = Math.hypot(shape[k][0] - la, (shape[k][1] - lo) * 0.75);
      if (best === null || dd < best) { best = dd; bj = k; }
    }
    if (best === null || best > tol) return null;
    idx.push(bj); j = bj; cost += best;
  }
  return { idx, cost };
}

// ---------- упаковка набора ----------
function pack(raw, id, label, geo = []) {
  const rd = openZip(raw);
  const stops = rd('stops'), routes = rd('routes'), trips = rd('trips');
  const sidx = new Map(stops.map((s, i) => [s.stop_id, i]));
  const ridx = new Map(routes.map((r, i) => [r.route_id, i]));
  const by = new Map();
  for (const s of rd('stop_times')) { if (!by.has(s.trip_id)) by.set(s.trip_id, []); by.get(s.trip_id).push(s); }

  const pats = new Map(), plist = [], out = [], svc = [], heads = [], hidx = new Map();
  for (const t of trips) {
    let rows = (by.get(t.trip_id) || []).sort((x, y) => +x.stop_sequence - +y.stop_sequence).filter(r => sidx.has(r.stop_id));
    if (rows.length < 2 || !ridx.has(t.route_id)) continue;
    const a = fill(rows.map(r => ts(r.arrival_time || r.departure_time)));
    if (a[0] === null) continue;
    const s0 = a[0], seq = rows.map(r => sidx.get(r.stop_id)), rel = a.map(x => Math.round(x - s0));
    const key = seq.join(',') + '|' + rel.join(',');
    if (!pats.has(key)) { pats.set(key, plist.length); plist.push([seq, rel]); }
    if (!svc.includes(t.service_id)) svc.push(t.service_id);
    const h = tidy(t.trip_headsign || '');
    if (!hidx.has(h)) { hidx.set(h, heads.length); heads.push(h); }
    out.push([pats.get(key), Math.round(s0), ridx.get(t.route_id), svc.indexOf(t.service_id), hidx.get(h)]);
  }

  // геометрия: подбираем трассу для каждой уникальной последовательности остановок
  const shpOut = [], shpMap = new Map(), gcache = new Map();
  const geom = seq => {
    const k = seq.join(',');
    if (!gcache.has(k)) {
      const ll = seq.map(i => [+stops[i].stop_lat, +stops[i].stop_lon]);
      let best = null;
      geo.forEach((sh, si) => { const r = snap(ll, sh); if (r && (!best || r.cost < best.cost)) best = { si, ...r }; });
      if (best) {
        if (!shpMap.has(best.si)) { shpMap.set(best.si, shpOut.length); shpOut.push(geo[best.si]); }
        gcache.set(k, [shpMap.get(best.si), best.idx]);
      } else gcache.set(k, null);
    }
    return gcache.get(k);
  };
  for (const p of plist) p.push(...(geom(p[0]) || [null, null]));
  console.log(`  ${id}: трассы найдены для ${plist.filter(p => p[2] !== null).length} из ${plist.length} шаблонов маршрутов`);

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const cal = rd('calendar').map(c => [c.service_id, days.map(k => c[k]).join(''), c.start_date, c.end_date]);
  const cd = rd('calendar_dates').map(c => [c.service_id, c.date, c.exception_type]);
  if (cal.length) {
    const lo = cal.map(c => c[2]).sort()[0], hi = cal.map(c => c[3]).sort().at(-1);
    const fm = d => `${d.slice(6)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
    label += ` (${fm(lo)}–${fm(hi)})`;
  }
  const r6 = x => Number((+x).toFixed(6)), r5 = x => Number(x.toFixed(5));
  return {
    id, label,
    stops: stops.map(s => [tidy(s.stop_name), r6(s.stop_lat), r6(s.stop_lon)]),
    routes: routes.map(r => [tidy(r.route_short_name || r.route_long_name || ''), '#' + (r.route_color || '1f6f4a'), '#' + (r.route_text_color || 'FFFFFF')]),
    svc, heads, pats: plist, shapes: shpOut.map(sh => sh.map(([a, b]) => [r5(a), r5(b)])), trips: out, cal, cd,
  };
}

// ---------- main ----------
const a = parseArgs(process.argv.slice(2));
const urls = (a.main && (a.summer || a.noSummer)) ? {} : await discover();
const raws = {};
for (const [key, src] of [['main', a.main || urls.main], ['summer', a.noSummer ? null : (a.summer || urls.summer)]]) {
  if (!src) continue;
  try { raws[key] = await fetchBytes(src); } catch (e) {
    console.error(`ПРЕДУПРЕЖДЕНИЕ: «${key}» не загружен: ${e.message}`);
    const local = `data/${key}.zip`;   // запасной вариант: архив, положенный в репозиторий вручную
    if (existsSync(local)) { raws[key] = new Uint8Array(readFileSync(local)); console.error(`Использую локальный файл ${local}`); }
  }
}
if (!raws.main) { console.error('Основной архив не загружен, публикация отменена'); process.exit(1); }

let geo = readShapes(raws.main);
if (!geo.length && a.borrowShapes && raws.summer) geo = readShapes(raws.summer);
console.log('Источник трасс:', geo.length ? 'есть' : 'нет (прямые линии)', `(${geo.length} трасс)`);

const now = new Date(), today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
const sets = [];
for (const [key, label] of [['main', 'Основное'], ['summer', 'Летнее']]) {
  if (!raws[key]) continue;
  let s;
  try { s = pack(raws[key], key, label, geo); } catch (e) {
    console.error(`ПРЕДУПРЕЖДЕНИЕ: «${key}» не разобран: ${e.message}`);
    if (key === 'main') process.exit(1);
    continue;
  }
  const end = s.cal.map(c => c[3]).sort().at(-1) || '';
  if (key === 'summer' && end < today) { console.error(`ПРЕДУПРЕЖДЕНИЕ: летний архив устарел (действовал до ${end}), в расписания не включён.`); continue; }
  if (key === 'main' && end < today) console.error(`ПРЕДУПРЕЖДЕНИЕ: основной архив уже не действует (до ${end}); карта покажет его по дню недели.`);
  sets.push(s); console.log(`${key}: ${s.trips.length} рейсов, ${s.label}`);
}
const data = { generated: now.toLocaleDateString('ru-RU'), sets };
const js = JSON.stringify(data).replaceAll('</', '<\\/');
writeFileSync(a.out, readFileSync(a.template, 'utf8')
  .replace('__APP__', () => readFileSync(a.app, 'utf8'))
  .replace('__DATA__', () => js));
console.log('Готово:', a.out);
