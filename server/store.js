import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
export const files = ['employees', 'onboarding_tasks', 'contacts', 'policies', 'trainings', 'skills', 'tools', 'execution_logs'];
export async function read(name) { return JSON.parse(await fs.readFile(path.join(dataDir, `${name}.json`), 'utf8')); }
export async function write(name, value) { await fs.writeFile(path.join(dataDir, `${name}.json`), JSON.stringify(value, null, 2) + '\n', 'utf8'); return value; }
export async function appendLog(item) { const rows = await read('execution_logs'); rows.unshift(item); await write('execution_logs', rows.slice(0, 200)); }
