import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { getAllSessions } from "../../db/index.js";
import type { SSEConnectedEvent, SSESessionsEvent, SSEErrorEvent } from "../types.js";

const POLL_INTERVAL = 500;

export async function streamRoute(c: Context) {
  return streamSSE(c, async (stream) => {
    const connectedEvent: SSEConnectedEvent = {
      message: "Connected to session stream",
      timestamp: Date.now(),
    };
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify(connectedEvent),
    });

    let running = true;

    stream.onAbort(() => {
      running = false;
    });

    while (running) {
      try {
        const sessions = getAllSessions();

        const sessionsEvent: SSESessionsEvent = {
          sessions,
          count: sessions.length,
          timestamp: Date.now(),
        };
        await stream.writeSSE({
          event: "sessions",
          data: JSON.stringify(sessionsEvent),
        });
      } catch {
        const errorEvent: SSEErrorEvent = {
          error: "Error reading sessions",
          timestamp: Date.now(),
        };
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify(errorEvent),
        });
      }

      await stream.sleep(POLL_INTERVAL);
    }
  });
}
