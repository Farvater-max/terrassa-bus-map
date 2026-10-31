import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function renderPage({
  templatePath,
  appPath,
  stylesPath = 'styles.css',
  translationsPaths = { es: 'src/i18n/es.json', ca: 'src/i18n/ca.json' },
  outputPath,
  supabaseUrl,
  anonKey,
}) {
  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required to publish the page.');
  }
  const [template, spanish, catalan] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(translationsPaths.es, 'utf8').then(JSON.parse),
    readFile(translationsPaths.ca, 'utf8').then(JSON.parse),
  ]);
  const html = template
    .replace('__TRANSLATIONS__', () => JSON.stringify({ es: spanish, ca: catalan }))
    .replace('__SUPABASE_URL__', () => JSON.stringify(supabaseUrl))
    .replace('__SUPABASE_ANON_KEY__', () => JSON.stringify(anonKey));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
  await rm(join(dirname(outputPath), 'src/client'), { recursive: true, force: true });
  await Promise.all([
    copyFile(appPath, join(dirname(outputPath), 'app.js')),
    copyFile(stylesPath, join(dirname(outputPath), 'styles.css')),
    cp('src/client', join(dirname(outputPath), 'src/client'), { recursive: true }),
  ]);
  console.log('Page generated:', outputPath);
}
