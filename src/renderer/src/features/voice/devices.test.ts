import { describe, expect, it } from "vitest";
import {
  cleanDeviceLabel,
  deviceOptions,
  meterSegments,
  resolveDeviceSelection,
} from "./devices";

function device(deviceId: string, label = ""): MediaDeviceInfo {
  return {
    deviceId,
    label,
    kind: "audioinput",
    groupId: "g",
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

describe("cleanDeviceLabel", () => {
  it("strips the usb vendor id suffix", () => {
    expect(cleanDeviceLabel("Microphone (Realtek) (0d8c:0014)")).toBe(
      "Microphone (Realtek)",
    );
    expect(cleanDeviceLabel("  Headset   Mic ")).toBe("Headset Mic");
  });
});

describe("deviceOptions", () => {
  it("drops empty ids, dedupes and names unlabelled devices", () => {
    const options = deviceOptions(
      [
        device(""),
        device("default", "Default - Headset"),
        device("abc", ""),
        device("abc", "duplicate"),
      ],
      "Микрофон",
    );

    expect(options).toEqual([
      { deviceId: "default", label: "Default - Headset", isSystem: true },
      { deviceId: "abc", label: "Микрофон 3", isSystem: false },
    ]);
  });
});

describe("resolveDeviceSelection", () => {
  const options = deviceOptions([device("a", "A"), device("b", "B")], "Mic");

  it("keeps a saved device that still exists", () => {
    expect(resolveDeviceSelection("b", options)).toEqual({
      deviceId: "b",
      isMissing: false,
    });
  });

  it("falls back to the first device and reports the loss", () => {
    expect(resolveDeviceSelection("gone", options)).toEqual({
      deviceId: "a",
      isMissing: true,
    });
  });

  it("does not report a loss when nothing was saved", () => {
    expect(resolveDeviceSelection("", options)).toEqual({
      deviceId: "a",
      isMissing: false,
    });
  });

  it("survives an empty device list", () => {
    expect(resolveDeviceSelection("gone", [])).toEqual({
      deviceId: "",
      isMissing: false,
    });
  });
});

describe("meterSegments", () => {
  it("scales the level onto the segment count", () => {
    expect(meterSegments(0, 18)).toBe(0);
    expect(meterSegments(-1, 18)).toBe(0);
    expect(meterSegments(1, 18)).toBe(18);
    expect(meterSegments(0.5, 18)).toBe(13);
  });
});
