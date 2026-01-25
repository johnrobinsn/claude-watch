import { describe, it, expect } from "vitest";
import { isPidAlive } from "../../src/utils/pid.js";

describe("isPidAlive", () => {
  it("should return true for current process", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it("should return false for non-existent PID", () => {
    // Use a very high PID that's unlikely to exist
    expect(isPidAlive(999999999)).toBe(false);
  });

  it("should return true for parent process", () => {
    expect(isPidAlive(process.ppid)).toBe(true);
  });
});
