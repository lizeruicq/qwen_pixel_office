import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export interface AppConfig {
  rootDir: string;
  dwsBin: string;
  pollIntervalSec: number;
  todoPageSize: number;
  wsPort: number;
  llm: LlmConfig;
}

export function loadConfig(): AppConfig {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const raw = JSON.parse(readFileSync(resolve(rootDir, 'config/config.json'), 'utf8'));

  const envKeys: string[] = raw.llm?.apiKeyEnv ?? [];
  let apiKey = '';
  for (const k of envKeys) {
    if (process.env[k]) {
      apiKey = process.env[k] as string;
      break;
    }
  }

  return {
    rootDir,
    dwsBin: raw.dwsBin ?? 'dws',
    pollIntervalSec: raw.pollIntervalSec ?? 120,
    todoPageSize: raw.todoPageSize ?? 50,
    wsPort: Number(process.env.PIXEL_WS_PORT ?? raw.wsPort ?? 8787),
    llm: {
      baseUrl: process.env.PIXEL_LLM_BASE_URL ?? raw.llm?.baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: process.env.PIXEL_LLM_MODEL ?? raw.llm?.model ?? 'qwen-plus',
      apiKey,
      enabled: !!apiKey,
    },
  };
}
