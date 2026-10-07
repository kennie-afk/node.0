/**
 * A deliberately tiny Redis client: one connection, RESP2, the handful of commands the rate limiter needs. It exists so
 * shared rate limits do not pull a client library into the image. If Redis ever needs more than counters, replace this
 * with a real client rather than growing it.
 */
import net from 'node:net';
import tls from 'node:tls';

type Reply = string | number | null | Reply[] | Error;

export class RedisClient {
  private socket: net.Socket | null = null;
  private pending: Array<{ resolve: (value: Reply) => void; reject: (error: Error) => void }> = [];
  private buffer = Buffer.alloc(0);
  private connecting: Promise<void> | null = null;

  constructor(private readonly url: string, private readonly timeoutMs = 1500) {}

  private connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    this.connecting ??= new Promise<void>((resolve, reject) => {
      const u = new URL(this.url);
      const secure = u.protocol === 'rediss:';
      const port = Number(u.port || 6379);
      const socket = secure ? tls.connect({ host: u.hostname, port, servername: u.hostname }) : net.connect({ host: u.hostname, port });
      const timer = setTimeout(() => { socket.destroy(new Error('redis connect timeout')); }, this.timeoutMs);
      socket.setNoDelay(true);
      socket.on('data', (chunk) => this.onData(chunk));
      const fail = (error: Error) => {
        clearTimeout(timer);
        this.drop(error);
        reject(error);
      };
      socket.once('error', fail);
      socket.once('close', () => this.drop(new Error('redis connection closed')));
      socket.once(secure ? 'secureConnect' : 'connect', async () => {
        clearTimeout(timer);
        this.socket = socket;
        socket.removeListener('error', fail);
        socket.on('error', (error) => this.drop(error));
        try {
          if (u.password) await this.raw(u.username ? ['AUTH', decodeURIComponent(u.username), decodeURIComponent(u.password)] : ['AUTH', decodeURIComponent(u.password)]);
          if (u.pathname.length > 1) await this.raw(['SELECT', u.pathname.slice(1)]);
          resolve();
        } catch (error) {
          fail(error as Error);
        }
      });
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private drop(error: Error): void {
    this.socket?.destroy();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    const waiting = this.pending;
    this.pending = [];
    for (const w of waiting) w.reject(error);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const parsed = parse(this.buffer, 0);
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.next);
      const waiter = this.pending.shift();
      if (!waiter) continue;
      if (parsed.value instanceof Error) waiter.reject(parsed.value);
      else waiter.resolve(parsed.value);
    }
  }

  private raw(args: string[]): Promise<Reply> {
    return new Promise<Reply>((resolve, reject) => {
      const socket = this.socket;
      if (!socket) { reject(new Error('redis not connected')); return; }
      const timer = setTimeout(() => this.drop(new Error('redis command timeout')), this.timeoutMs);
      this.pending.push({ resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      let out = `*${args.length}\r\n`;
      for (const a of args) out += `$${Buffer.byteLength(a)}\r\n${a}\r\n`;
      socket.write(out);
    });
  }

  async command(args: string[]): Promise<Reply> {
    await this.connect();
    return this.raw(args);
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}

/** Parses one RESP2 value starting at `at`; null when the buffer does not hold all of it yet. */
function parse(buf: Buffer, at: number): { value: Reply; next: number } | null {
  if (at >= buf.length) return null;
  const end = buf.indexOf('\r\n', at, 'utf8');
  if (end === -1) return null;
  const kind = String.fromCharCode(buf[at]!);
  const line = buf.toString('utf8', at + 1, end);
  const after = end + 2;
  switch (kind) {
    case '+': return { value: line, next: after };
    case '-': return { value: new Error(line), next: after };
    case ':': return { value: Number(line), next: after };
    case '$': {
      const len = Number(line);
      if (len === -1) return { value: null, next: after };
      if (buf.length < after + len + 2) return null;
      return { value: buf.toString('utf8', after, after + len), next: after + len + 2 };
    }
    case '*': {
      const count = Number(line);
      if (count === -1) return { value: null, next: after };
      const items: Reply[] = [];
      let cursor = after;
      for (let i = 0; i < count; i += 1) {
        const item = parse(buf, cursor);
        if (!item) return null;
        items.push(item.value);
        cursor = item.next;
      }
      return { value: items, next: cursor };
    }
    default:
      return { value: new Error(`unexpected redis reply type ${kind}`), next: after };
  }
}
