#!/usr/bin/env node

import { existsSync, unlinkSync } from "fs";
import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

const DEMO_DB_PATH = join(homedir(), ".claude-watch", "demo.db");

const DEMO_SESSIONS = [
  // Busy sessions (green)
  {
    id: "demo-1",
    pid: 10001,
    cwd: join(homedir(), "projects/api-server"),
    tmux_target: "dev:0.0",
    state: "busy",
    current_action: "Running: Bash",
    prompt_text: null,
  },
  {
    id: "demo-2",
    pid: 10002,
    cwd: join(homedir(), "projects/webapp"),
    tmux_target: "dev:0.1",
    state: "busy",
    current_action: "Running: Edit",
    prompt_text: null,
  },
  {
    id: "demo-3",
    pid: 10003,
    cwd: join(homedir(), "projects/cli-tool"),
    tmux_target: "dev:1.0",
    state: "busy",
    current_action: "Working...",
    prompt_text: null,
  },
  // Idle sessions (yellow)
  {
    id: "demo-4",
    pid: 10004,
    cwd: join(homedir(), "projects/docs"),
    tmux_target: "dev:1.1",
    state: "idle",
    current_action: null,
    prompt_text: null,
  },
  {
    id: "demo-5",
    pid: 10005,
    cwd: join(homedir(), "projects/tests"),
    tmux_target: "dev:2.0",
    state: "idle",
    current_action: null,
    prompt_text: null,
  },
  // Permission/Waiting sessions (red)
  {
    id: "demo-6",
    pid: 10006,
    cwd: join(homedir(), "projects/deploy"),
    tmux_target: "main:0.0",
    state: "permission",
    current_action: null,
    prompt_text: null,
  },
  {
    id: "demo-7",
    pid: 10007,
    cwd: join(homedir(), "projects/config"),
    tmux_target: "main:0.1",
    state: "waiting",
    current_action: null,
    prompt_text: "Which database should I use?",
  },
];

function create() {
  // Remove existing demo database if it exists
  if (existsSync(DEMO_DB_PATH)) {
    unlinkSync(DEMO_DB_PATH);
  }

  console.log("Creating demo database...");
  const db = new Database(DEMO_DB_PATH);

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      cwd TEXT NOT NULL,
      tmux_target TEXT,
      state TEXT NOT NULL DEFAULT 'idle',
      current_action TEXT,
      prompt_text TEXT,
      last_update INTEGER NOT NULL,
      metadata TEXT
    )
  `);

  // Insert demo data
  const insert = db.prepare(`
    INSERT INTO sessions (id, pid, cwd, tmux_target, state, current_action, prompt_text, last_update, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  const now = Date.now();
  for (const session of DEMO_SESSIONS) {
    insert.run(
      session.id,
      session.pid,
      session.cwd,
      session.tmux_target,
      session.state,
      session.current_action,
      session.prompt_text,
      now
    );
    console.log(`  + ${session.state.padEnd(10)} ${session.cwd}`);
  }

  db.close();

  console.log("");
  console.log("Demo database created at:", DEMO_DB_PATH);
  console.log("");
  console.log("To view the demo, run:");
  console.log(`  claude-watch --demo-db "${DEMO_DB_PATH}"`);
  console.log("");
  console.log("To clean up:");
  console.log("  node scripts/demo-data.js clean");
}

function clean() {
  if (!existsSync(DEMO_DB_PATH)) {
    console.log("No demo database found.");
    return;
  }

  unlinkSync(DEMO_DB_PATH);
  console.log("Demo database removed:", DEMO_DB_PATH);
}

// CLI
const command = process.argv[2];

switch (command) {
  case "create":
    create();
    break;
  case "clean":
    clean();
    break;
  default:
    console.log("Usage: node scripts/demo-data.js <command>");
    console.log("");
    console.log("Commands:");
    console.log("  create   Create a demo database with sample sessions");
    console.log("  clean    Remove the demo database");
    process.exit(1);
}
