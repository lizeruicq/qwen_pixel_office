import { spawn } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * 构造 dws 子进程环境：剥离 QoderWork 会话变量（DWS_/QWORK_/QODERWORK_ 等前缀）。
 * 带会话变量时 shim 会输出“等待宿主执行”占位符（代理 Bash 模式）；
 * 剥离后 shim 走本地直通模式，直接执行命令——这是常驻后端需要的模式。
 */
export function dwsSpawnEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (/^(DWS|QWORK|QODERWORK|DINGTALK_DWS)_/.test(k)) continue;
    env[k] = v;
  }
  return env;
}

/** 执行一次性 dws 命令（用于查询与写回，不用于 event consume 长连接） */
export function execDws(dwsBin: string, args: string[], timeoutMs = 60_000): Promise<ExecResult> {
  return new Promise((resolveResult) => {
    const proc = spawn(dwsBin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: dwsSpawnEnv() });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolveResult({ code: -1, stdout, stderr: `${stderr}\nspawn error: ${String(err)}` });
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolveResult({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * 执行 dws 并解析 JSON 输出。
 * 失败时按 dws 错误处理流程加 --verbose 重试一次；仍失败则抛错。
 */
export async function dwsJson<T = unknown>(dwsBin: string, args: string[]): Promise<T> {
  const full = args.includes('--format') ? args : [...args, '--format', 'json'];
  let r = await execDws(dwsBin, full);
  if (r.code !== 0) {
    r = await execDws(dwsBin, [...full, '--verbose']);
  }
  if (r.code !== 0) {
    throw new Error(`dws ${args.join(' ')} 失败: ${(stderrSummary(r.stderr) || r.stdout.slice(0, 300)).trim()}`);
  }
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    throw new Error(`dws 输出不是 JSON: ${r.stdout.slice(0, 200)}`);
  }
}

function stderrSummary(stderr: string): string {
  // dws 错误 JSON 通常在 stderr 中，提取 message 字段
  try {
    const obj = JSON.parse(stderr);
    if (obj?.error?.message) return String(obj.error.message);
    if (obj?.message) return String(obj.message);
  } catch {
    /* not json */
  }
  return stderr.slice(0, 500);
}
