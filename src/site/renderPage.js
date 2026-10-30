import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function renderPage({ templatePath, appPath, outputPath, supabaseUrl, anonKey }) {
  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required to publish the page.');
  }
  const [template, app] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(appPath, 'utf8'),
  ]);
  const html = template
    .replace('__APP__', () => app)
    .replace('__SUPABASE_URL__', () => JSON.stringify(supabaseUrl))
    .replace('__SUPABASE_ANON_KEY__', () => JSON.stringify(anonKey));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
  console.log('Page generated:', outputPath);
}
