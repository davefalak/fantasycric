declare module "node:crypto" {
  export function randomUUID(): string;
  export function randomBytes(size: number): { toString(encoding: string): string };
  export function scryptSync(password: string, salt: string, keylen: number): { toString(encoding: string): string };
  export function timingSafeEqual(a: { length: number }, b: { length: number }): boolean;
}

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module "node:path" {
  const path: {
    resolve: (...parts: string[]) => string;
    dirname: (input: string) => string;
    join: (...parts: string[]) => string;
  };
  export default path;
}

declare module "node:http" {
  export interface IncomingMessage extends AsyncIterable<unknown> {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
  }

  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): ServerResponse;
    end(chunk?: string): void;
  }

  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  ): {
    listen(port: number, onListen?: () => void): void;
  };
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

declare const Buffer: {
  isBuffer(value: unknown): boolean;
  from(value: unknown, encoding?: string): any;
  concat(values: any[]): { toString(encoding: string): string };
};

declare module "pg" {
  export interface QueryResult<T = unknown> {
    rows: T[];
  }

  export interface PoolClient {
    query<T = unknown>(queryText: string, values?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: { connectionString?: string; max?: number; idleTimeoutMillis?: number });
    query<T = unknown>(queryText: string, values?: unknown[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}
