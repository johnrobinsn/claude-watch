import { Hono } from "hono";
import { getAllSessions, getSession, updateSession } from "../../db/index.js";
import { checkForInterruption, getPaneTitle } from "../../tmux/pane.js";
import type { SessionsResponse, SessionResponse, ErrorResponse } from "../types.js";

export const sessionsRoutes = new Hono();

// Sync session state by detecting interruptions (user pressed Escape)
// Hooks are authoritative for all other state transitions
function syncSessionStates(): void {
  const sessions = getAllSessions().filter((s) => s.tmux_target);

  for (const session of sessions) {
    if (!session.tmux_target) continue;

    const update = checkForInterruption(session.tmux_target);
    if (update && session.state !== "idle") {
      updateSession(session.id, update);
    }
  }
}

// Deduplicate sessions by tmux_target, keeping only the most recent one
function deduplicateByTmuxTarget<T extends { tmux_target: string | null; last_update: number }>(
  sessions: T[]
): T[] {
  const byTarget = new Map<string, T>();
  const noTarget: T[] = [];

  for (const session of sessions) {
    if (!session.tmux_target) {
      noTarget.push(session);
      continue;
    }

    const existing = byTarget.get(session.tmux_target);
    if (!existing || session.last_update > existing.last_update) {
      byTarget.set(session.tmux_target, session);
    }
  }

  return [...byTarget.values(), ...noTarget];
}

// GET /api/sessions
sessionsRoutes.get("/", (c) => {
  try {
    syncSessionStates();
    const sessions = getAllSessions();
    // Enrich sessions with pane titles from tmux
    const enrichedSessions = sessions.map((s) => ({
      ...s,
      pane_title: s.tmux_target ? getPaneTitle(s.tmux_target) : null,
    }));
    // Deduplicate by tmux_target to avoid showing same pane multiple times
    const dedupedSessions = deduplicateByTmuxTarget(enrichedSessions);
    const response: SessionsResponse = {
      sessions: dedupedSessions,
      count: dedupedSessions.length,
      timestamp: Date.now(),
    };
    return c.json(response);
  } catch {
    const error: ErrorResponse = { error: "Error reading sessions" };
    return c.json(error, 500);
  }
});

// GET /api/sessions/:id
sessionsRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  try {
    const session = getSession(id);
    if (!session) {
      const error: ErrorResponse = { error: "Session not found", id };
      return c.json(error, 404);
    }
    const response: SessionResponse = {
      session,
      timestamp: Date.now(),
    };
    return c.json(response);
  } catch {
    const error: ErrorResponse = { error: "Error reading session" };
    return c.json(error, 500);
  }
});
