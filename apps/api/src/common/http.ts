import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function sendText(response: ServerResponse, statusCode: number, payload: string, contentType = "text/plain; charset=utf-8"): void {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*"
  });
  response.end(payload);
}

export function getUserId(request: IncomingMessage): string {
  const header = request.headers["x-user-id"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  return "demo-user";
}

export function getBearerToken(request: IncomingMessage): string {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return "";
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return "";
  }

  return token.trim();
}
