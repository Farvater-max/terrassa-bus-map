#!/usr/bin/env node
import { watch, readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { renderPage } from '../src/site/renderPage.js';

async function loadEnvFile(filePath = '.env.debug.local') {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

await loadEnvFile();

const outputDirectory = resolve('.dev');
const outputPath = resolve(outputDirectory, 'index.html');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
let building = Promise.resolve();

async function build() {
  building = building.catch(() => {}).then(() => renderPage({
    templatePath: 'map_template.html',
    appPath: 'app.js',
    outputPath,
    supabaseUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  }));
  return building;
}

await mkdir(dirname(outputPath), { recursive: true });
await build();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  const assetPath = resolve(outputDirectory, `.${pathname}`);
  const assetRelativePath = relative(outputDirectory, assetPath);
  const isAllowed = assetRelativePath === 'index.html'
    || assetRelativePath === 'app.js'
    || assetRelativePath === 'styles.css'
    || assetRelativePath.startsWith(`src${sep}client${sep}`);
  if (!isAllowed || assetRelativePath.startsWith('..')) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    await building;
    const content = await readFile(assetPath);
    response.writeHead(200, {
      'content-type': contentTypes[extname(assetPath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(content);
  } catch (error) {
    const isIndex = assetRelativePath === 'index.html';
    response.writeHead(isIndex ? 500 : 404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(isIndex ? `Development build failed: ${error.message}` : 'Not found');
  }
});

server.listen(port, host, () => console.log(`Development server: http://${host}:${port}`));

for (const directory of ['.', 'src/client', 'src/i18n']) {
  const watcher = await watch(directory);
  (async () => {
    for await (const event of watcher) {
      const file = event.filename?.toString() || '';
      const shouldBuild = directory === '.'
        ? ['app.js', 'map_template.html', 'styles.css'].includes(file)
        : directory === 'src/i18n' || file.endsWith('.js');
      if (!shouldBuild) continue;
      try {
        await build();
        console.log(`Rebuilt after ${directory}/${file} changed`);
      } catch (error) {
        console.error(`Build failed: ${error.message}`);
      }
    }
  })();
}
