import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const propertiesPath = resolve(root, 'application.properties');
const properties = readFileSync(propertiesPath, 'utf8');
const apiBaseUrlValue = properties
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith('api.base-url='))
  ?.slice('api.base-url='.length)
  .trim();

if (!apiBaseUrlValue) {
  throw new Error(`Missing api.base-url in ${propertiesPath}`);
}

const apiBaseUrl = new URL(apiBaseUrlValue);
if (!['http:', 'https:'].includes(apiBaseUrl.protocol) || apiBaseUrl.username || apiBaseUrl.password) {
  throw new Error('api.base-url must be an HTTP(S) URL without credentials');
}

const generatedEnvironmentPath = resolve(root, 'src/environments/api-config.generated.ts');
const mode = process.argv[2];

if (mode === '--prepare') {
  writeFileSync(
    generatedEnvironmentPath,
    `export const apiBaseUrl = ${JSON.stringify(apiBaseUrlValue)};\n`,
  );
} else if (mode === '--finalize') {
  const headersPath = resolve(root, 'dist/tesla-pwa/browser/_headers');
  const headers = readFileSync(headersPath, 'utf8');
  if (!headers.includes('__API_ORIGIN__')) {
    throw new Error(`Missing __API_ORIGIN__ placeholder in ${headersPath}`);
  }
  writeFileSync(headersPath, headers.replaceAll('__API_ORIGIN__', apiBaseUrl.origin));
} else {
  throw new Error('Usage: node scripts/configure-app.mjs --prepare|--finalize');
}
