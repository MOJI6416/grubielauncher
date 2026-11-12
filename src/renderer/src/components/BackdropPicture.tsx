import type { BackdropFrame } from "@/shared/themes";

const FILL_BLUR = 40;

export function BackdropPicture({
  url,
  frame,
  blur,
  unit = "px",
}: {
  url: string;
  frame: BackdropFrame;
  blur: number;
  unit?: "px" | "cqw";
}) {
  const length = (pixels: number) =>
    unit === "px" ? `${pixels}px` : `${(pixels / 12.8).toFixed(3)}cqw`;
  const image = `url("${url}")`;

  return (
    <>
      {frame.fit === "contain" && (
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center"
          style={{ backgroundImage: image, filter: `blur(${length(FILL_BLUR)})` }}
        />
      )}
      <div
        className="absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: image,
          backgroundSize: frame.fit === "stretch" ? "100% 100%" : frame.fit,
          backgroundPosition:
            frame.fit === "cover" ? `${frame.focusX}% ${frame.focusY}%` : "center",
          filter: blur ? `blur(${length(blur)})` : undefined,
          transform: blur ? "scale(1.06)" : undefined,
        }}
      />
    </>
  );
}
