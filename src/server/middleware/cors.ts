import { cors } from "hono/cors";

export function corsMiddleware() {
  return cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  });
}
