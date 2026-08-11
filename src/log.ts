const fmt = (n: number) => new Date(n).toLocaleTimeString('zh-CN', { hour12: false });

export function log(tag: string, msg: string): void {
  console.log(`[${fmt(Date.now())}] [${tag}] ${msg}`);
}
