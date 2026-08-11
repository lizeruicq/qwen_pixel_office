/** 与后端 WebSocket 的连接客户端：自动重连、状态回调。 */
export class GameSocket {
  constructor(url, { onMessage, onStatus } = {}) {
    this.url = url;
    this.onMessage = onMessage ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.ws = null;
    this.closedByUser = false;
    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => this.onStatus(true);
    this.ws.onclose = () => {
      this.onStatus(false);
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    };
    this.ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data));
      } catch {
        /* 忽略坏包 */
      }
    };
  }

  scheduleReconnect() {
    if (this.closedByUser) return;
    setTimeout(() => {
      if (!this.closedByUser) this.connect();
    }, 3000);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.closedByUser = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
