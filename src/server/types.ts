import type { Session } from "../db/index.js";

export interface SessionsResponse {
  sessions: Session[];
  count: number;
  timestamp: number;
}

export interface SessionResponse {
  session: Session;
  timestamp: number;
}

export interface ErrorResponse {
  error: string;
  id?: string;
}

export interface SSEConnectedEvent {
  message: string;
  timestamp: number;
}

export interface SSESessionsEvent {
  sessions: Session[];
  count: number;
  timestamp: number;
}

export interface SSEErrorEvent {
  error: string;
  timestamp: number;
}
