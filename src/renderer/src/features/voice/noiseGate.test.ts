import { describe, expect, it } from "vitest";
import { clampGateDb, DEFAULT_GATE_DB } from "@/shared/voiceGate";
import { createNoiseGate, levelFraction, peakDb } from "./noiseGate";

const RATE = 48000;
const FRAME = 480;

function frame(amplitude: number): Float32Array {
  const data = new Float32Array(FRAME);
  for (let index = 0; index < FRAME; index++) {
    data[index] = amplitude * Math.sin((2 * Math.PI * 220 * index) / RATE);
  }
  return data;
}

function peak(data: Float32Array): number {
  return data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

describe("peakDb and levelFraction", () => {
  it("measures the frame peak in dBFS", () => {
    expect(peakDb(frame(1))).toBeCloseTo(0, 1);
    expect(peakDb(frame(0.1))).toBeCloseTo(-20, 0);
    expect(peakDb(new Float32Array(FRAME))).toBe(-120);
  });

  it("maps -60..0 dB onto the meter", () => {
    expect(levelFraction(-90)).toBe(0);
    expect(levelFraction(-30)).toBeCloseTo(0.5);
    expect(levelFraction(0)).toBe(1);
  });

  it("clamps the threshold setting", () => {
    expect(clampGateDb(-100)).toBe(-60);
    expect(clampGateDb(5)).toBe(-10);
    expect(clampGateDb(Number.NaN)).toBe(DEFAULT_GATE_DB);
    expect(clampGateDb(-33.4)).toBe(-33);
  });
});

describe("createNoiseGate", () => {
  it("passes audio untouched when the gate is off", () => {
    const gate = createNoiseGate(RATE, null);
    const data = frame(0.001);
    expect(gate.process(data)).toBe(true);
    expect(peak(data)).toBeCloseTo(0.001, 6);
  });

  it("keeps quiet noise silent and opens on speech without a click", () => {
    const gate = createNoiseGate(RATE, -40);

    const noise = frame(0.003);
    expect(gate.process(noise)).toBe(false);
    expect(peak(noise)).toBe(0);

    const speech = frame(0.3);
    expect(gate.process(speech)).toBe(true);
    expect(Math.abs(speech[0])).toBeLessThan(0.01);
    expect(peak(speech.subarray(FRAME / 2))).toBeGreaterThan(0.29);
  });

  it("holds briefly after speech and then fades out smoothly", () => {
    const gate = createNoiseGate(RATE, -40);
    gate.process(frame(0.3));
    gate.process(frame(0.3));

    const pauses = Array.from({ length: 40 }, () => frame(0.003));
    const open = pauses.map((data) => gate.process(data));

    expect(open.slice(0, 25).every(Boolean)).toBe(true);
    expect(open.at(-1)).toBe(false);
    expect(peak(pauses.at(-1)!)).toBe(0);

    const fade = pauses[open.indexOf(false)];
    expect(peak(fade)).toBeGreaterThan(0);
    expect(peak(fade)).toBeLessThan(0.003);
  });

  it("can be switched off on the fly", () => {
    const gate = createNoiseGate(RATE, -40);
    gate.process(frame(0.003));
    gate.setThreshold(null);
    const data = frame(0.003);
    gate.process(data);
    expect(peak(data)).toBeCloseTo(0.003, 6);
  });
});
