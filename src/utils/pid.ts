/**
 * Check if a process with the given PID is still alive.
 */
export function isPidAlive(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process but checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
