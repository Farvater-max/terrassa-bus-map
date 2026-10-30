#!/usr/bin/env node
import { renderPage } from '../src/site/renderPage.js';

function parseArgs(argv) {
  const options = { template: 'map_template.html', app: 'app.js', out: 'index.html' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) options[arg.slice(2)] = argv[++i];
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
renderPage({
  templatePath: options.template,
  appPath: options.app,
  outputPath: options.out,
  supabaseUrl: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
