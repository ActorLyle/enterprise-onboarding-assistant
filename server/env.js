import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root } from './store.js';

// Load local development settings without requiring dotenv. Shell-provided
// environment variables always take precedence over values in .env.
export async function loadEnvFile() {
  let contents;
  try { contents = await fs.readFile(path.join(root, '.env'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name] = match;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

function registryEntries(hive) {
  if (process.platform !== 'win32') return [];
  try {
    const output = execFileSync('reg.exe', ['query', hive], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    });
    return output.split(/\r?\n/).flatMap(line => {
      const match = line.trim().match(/^(\S+)\s+REG_\S+\s+(.*)$/i);
      return match ? [[match[1], match[2].trim()]] : [];
    });
  } catch { return []; }
}

export function getCozeToken(configuredName = process.env.COZE_API_TOKEN_VAR) {
  const directNames = [configuredName, process.env.COZE_API_TOKEN_VAR, 'COZE_API_TOKEN', 'COZE_ACCESS_TOKEN', 'COZE_API_KEY', 'COZE_TOKEN'].filter(Boolean);
  for (const name of directNames) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  // The provided Windows environment variable uses a numeric name. Support
  // that format without logging, returning, or exposing the credential itself.
  const isPat = value => /^pat_\S+$/i.test(value || '');
  for (const [name, value] of Object.entries(process.env)) {
    if (/^\d{10,}$/.test(name) && isPat(value)) return value.trim();
  }
  const hives = ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'];
  const requestedName = configuredName;
  for (const hive of hives) {
    const entries = registryEntries(hive);
    if (requestedName) {
      const requested = entries.find(([name]) => name.toLowerCase() === requestedName.toLowerCase());
      if (requested && isPat(requested[1])) return requested[1];
    }
    const token = entries.find(([name, value]) => /^\d{10,}$/.test(name) && isPat(value));
    if (token) return token[1];
    const canonical = entries.find(([name, value]) => directNames.some(direct => name.toLowerCase() === direct.toLowerCase()) && isPat(value));
    if (canonical) return canonical[1];
  }
  return '';
}
