import { describe, it, expect } from "vitest";
import { applyActivity, clearActivity, type ActivityState } from "./session-activity";

describe("applyActivity", () => {
  it("flags a non-focused session's output", () => {
    const next = applyActivity({}, { id: "s1", bell: false }, "s2");
    expect(next).toEqual({ s1: { output: true, bell: false } });
  });

  it("carries the bell flag through for a non-focused session", () => {
    const next = applyActivity({}, { id: "s1", bell: true }, null);
    expect(next).toEqual({ s1: { output: true, bell: true } });
  });

  it("does not raise a badge for the focused session", () => {
    const state: ActivityState = {};
    const next = applyActivity(state, { id: "s1", bell: true }, "s1");
    expect(next).toBe(state);
    expect(next).toEqual({});
  });

  it("OR-accumulates the bell flag across events", () => {
    const first = applyActivity({}, { id: "s1", bell: true }, null);
    const second = applyActivity(first, { id: "s1", bell: false }, null);
    expect(second.s1).toEqual({ output: true, bell: true });
  });

  it("does not mutate the input state", () => {
    const state: ActivityState = {};
    applyActivity(state, { id: "s1", bell: true }, null);
    expect(state).toEqual({});
  });

  it("returns the same reference when nothing changes", () => {
    const state = applyActivity({}, { id: "s1", bell: true }, null);
    const again = applyActivity(state, { id: "s1", bell: true }, null);
    expect(again).toBe(state);
  });

  it("ignores an event with an empty id", () => {
    const state: ActivityState = {};
    const next = applyActivity(state, { id: "", bell: true }, null);
    expect(next).toBe(state);
  });
});

describe("clearActivity", () => {
  it("removes a session's entry", () => {
    const state: ActivityState = {
      s1: { output: true, bell: true },
      s2: { output: true, bell: false },
    };
    const next = clearActivity(state, "s1");
    expect(next).toEqual({ s2: { output: true, bell: false } });
  });

  it("does not mutate the input state", () => {
    const state: ActivityState = { s1: { output: true, bell: true } };
    clearActivity(state, "s1");
    expect(state).toEqual({ s1: { output: true, bell: true } });
  });

  it("returns the same reference when the session has no entry", () => {
    const state: ActivityState = { s1: { output: true, bell: false } };
    const next = clearActivity(state, "s2");
    expect(next).toBe(state);
  });
});
