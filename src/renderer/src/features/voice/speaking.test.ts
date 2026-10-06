import { describe, expect, it } from "vitest";
import { createSpeakingDetector, rmsDb } from "./speaking";

function tone(amplitude: number): Float32Array {
  const data = new Float32Array(1024);
  for (let index = 0; index < data.length; index++) {
    data[index] = amplitude * Math.sin((2 * Math.PI * 200 * index) / 48000);
  }
  return data;
}

describe("rmsDb", () => {
  it("measures RMS in dBFS", () => {
    expect(rmsDb(tone(1))).toBeCloseTo(-3, 0);
    expect(rmsDb(tone(0.01))).toBeCloseTo(-43, 0);
    expect(rmsDb(new Float32Array(1024))).toBe(-120);
    expect(rmsDb(new Float32Array(0))).toBe(-120);
  });
});

describe("createSpeakingDetector", () => {
  it("lights up on the first loud sample", () => {
    const detector = createSpeakingDetector(-45, 300);
    expect(detector.update("a", -70, 0)).toBe(false);
    expect(detector.update("a", -30, 60)).toBe(true);
  });

  it("holds through short pauses and then lets go", () => {
    const detector = createSpeakingDetector(-45, 300);
    detector.update("a", -30, 0);
    expect(detector.update("a", -80, 250)).toBe(true);
    expect(detector.update("a", -80, 301)).toBe(false);
  });

  it("tracks people separately and forgets them", () => {
    const detector = createSpeakingDetector(-45, 300);
    detector.update("a", -30, 0);
    expect(detector.update("b", -80, 10)).toBe(false);
    detector.forget("a");
    expect(detector.update("a", -80, 20)).toBe(false);
  });
});
