import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function renderPage({ templatePath, appPath, outputPath, supabaseUrl, anonKey, mapsApiKey }) {
  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required to publish the page.');
  }
  if (!mapsApiKey) {
    throw new Error('MAPS_API_KEY is required to publish the page.');
  }
  const [template, app] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(appPath, 'utf8'),
  ]);
  const html = template
    .replace('__APP__', () => app)
    .replace('__SUPABASE_URL__', () => JSON.stringify(supabaseUrl))
    .replace('__SUPABASE_ANON_KEY__', () => JSON.stringify(anonKey))
    .replace('__MAPS_API_KEY__', () => JSON.stringify(mapsApiKey));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
  console.log('Page generated:', outputPath);
}
