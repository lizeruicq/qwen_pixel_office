import { spawn, type ChildProcess } from 'node:child_process';
import { log } from '../log.js';
import { dwsSpawnEnv } from './dws-exec.js';

export interface ConsumeOptions {
  /** 日志名 */
  name: string;
  /** 一个 consume 进程承载的兼容事件码（同目标同过滤条件才合并） */
  eventKeys: string[];
  /** 额外参数，如 --group / --user */
  extraArgs?: string[];
  /** 业务事件回调（JSON 行） */
  onEvent: (obj: unknown) => void;
}

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 10 * 60 * 1000;

/**
 * dws event consume 子进程管理器。
 * - 等待 `[event] ready` 行后才视为订阅成功；
 * - `[event]` 开头为控制行，其余按 NDJSON 解析为业务事件；
 * - 崩溃自动重启（10 分钟窗口内最多 5 次，指数退避）；
 * - 优雅退出：先关 stdin（pipe stdin 关闭 = dws 停机并自动退订），SIGTERM 兜底。
 */
export class ConsumeProc {
  private proc?: ChildProcess;
  private stopping = false;
  private restarts = 0;
  private windowStart = Date.now();
  private ready = false;
  private restartTimer?: NodeJS.Timeout;

  constructor(
    private dwsBin: string,
    private opts: ConsumeOptions,
  ) {}

  start(): void {
    this.spawnProc();
  }

  isReady(): boolean {
    return this.ready;
  }

  private spawnProc(): void {
    const args = [
      'event',
      'consume',
      ...this.opts.eventKeys,
      '--flatten',
      '-f',
      'ndjson',
      ...(this.opts.extraArgs ?? []),
    ];
    log(this.opts.name, `spawn: dws ${args.join(' ')}`);
    const proc = spawn(this.dwsBin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: dwsSpawnEnv() });
    this.proc = proc;
    this.ready = false;

    let buf = '';
    proc.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) this.handleLine(line);
      }
    });
    let errBuf = '';
    proc.stderr?.on('data', (d: Buffer) => {
      errBuf += d.toString();
      let idx: number;
      while ((idx = errBuf.indexOf('\n')) >= 0) {
        const line = errBuf.slice(0, idx).trim();
        errBuf = errBuf.slice(idx + 1);
        if (!line) continue;
        // dws 的 [event] 控制行（ready/bus/exited 等）从 stderr 输出
        if (line.startsWith('[event]')) this.handleLine(line);
        else log(this.opts.name, `stderr: ${line.slice(0, 300)}`);
      }
    });
    proc.on('exit', (code, signal) => this.handleExit(code, signal));
    proc.on('error', (err) => log(this.opts.name, `spawn error: ${String(err)}`));
  }

  private handleLine(line: string): void {
    if (line.startsWith('[event]')) {
      log(this.opts.name, line);
      if (line.includes('ready')) this.ready = true;
      return;
    }
    try {
      const obj = JSON.parse(line);
      this.opts.onEvent(obj);
    } catch {
      log(this.opts.name, `无法解析的行: ${line.slice(0, 120)}`);
    }
  }

  private handleExit(code: number | null, signal: string | null): void {
    if (this.stopping) return;
    const now = Date.now();
    if (now - this.windowStart > RESTART_WINDOW_MS) {
      this.windowStart = now;
      this.restarts = 0;
    }
    if (this.restarts >= MAX_RESTARTS) {
      log(this.opts.name, `退出(code=${code}, signal=${signal})，重启预算耗尽，停止（请检查 dws event status）`);
      return;
    }
    this.restarts += 1;
    const delay = Math.min(30_000, 2_000 * 2 ** (this.restarts - 1));
    log(this.opts.name, `退出(code=${code}, signal=${signal})，${delay}ms 后第 ${this.restarts} 次重启`);
    this.restartTimer = setTimeout(() => {
      if (!this.stopping) this.spawnProc();
    }, delay);
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    const p = this.proc;
    if (!p || p.exitCode !== null) return;
    // 优雅停机：pipe stdin 关闭即触发 dws 退订退出；3 秒后 SIGTERM 兜底。绝不 kill -9。
    try {
      p.stdin?.end();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        if (p.exitCode === null) p.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, 3_000);
  }
}
