import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  mixHex,
  themePalette,
  zonePalette,
  type ThemeDefinition,
} from "@/shared/themes";
import { BackdropPicture } from "@renderer/components/BackdropPicture";
import { backdropUrl } from "./themesStore";

const WIDTH = 640;
const HEIGHT = 360;

const NAV_ROWS = [28, 34, 24, 30];
const DOCK_ROWS = [56, 64, 48, 60, 52, 40];
const CARD_COLUMNS = [132, 258.5, 385, 511.5];
const CARD_NAMES = [70, 58, 80, 52, 64, 74, 46, 60];

export function ThemeMiniature({
  theme,
  accent,
  imageUrl,
  className,
}: {
  theme: ThemeDefinition;
  accent: string;
  imageUrl?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const palette = themePalette(theme, accent);
  const { background, surface, foreground } = theme.colors;
  const backdrop = theme.backdrop;
  const picture = backdrop
    ? (imageUrl ?? (backdrop.path ? backdropUrl(backdrop.path) : ""))
    : "";
  const panelOpacity = backdrop ? backdrop.panelOpacity / 100 : 1;
  const border = {
    fill: foreground,
    fillOpacity: theme.mode === "light" ? 0.12 : 0.09,
  };
  const thumb = mixHex(surface, foreground, 0.07);
  const icon = (index: number) =>
    mixHex(surface, foreground, [0.16, 0.24, 0.12, 0.2, 0.28, 0.14][index % 6]);
  const panel = { fillOpacity: panelOpacity };
  const side = zonePalette(theme, "sidebar", accent) ?? {
    ...palette,
    color: palette.surface1,
    foreground,
  };
  const top = zonePalette(theme, "topbar", accent) ?? {
    ...palette,
    color: background,
    foreground,
  };
  const sideBorder = { fill: side.foreground, fillOpacity: border.fillOpacity };
  const topBorder = { fill: top.foreground, fillOpacity: border.fillOpacity };

  return (
    <div
      aria-hidden
      className={cn(
        "@container relative isolate block aspect-video w-full overflow-hidden",
        className,
      )}
      style={{ background }}
    >
      {picture && (
        <BackdropPicture
          url={picture}
          frame={backdrop!}
          blur={backdrop!.blur}
          unit="cqw"
        />
      )}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <radialGradient
            id={`${uid}-glow`}
            gradientUnits="userSpaceOnUse"
            cx={141}
            cy={-56}
            r={416}
            gradientTransform="translate(141 -56) scale(1 0.46) translate(-141 56)"
          >
            <stop offset="0" stopColor={palette.primary} stopOpacity={0.11} />
            <stop offset="0.66" stopColor={palette.primary} stopOpacity={0} />
          </radialGradient>
          <radialGradient
            id={`${uid}-vignette`}
            gradientUnits="userSpaceOnUse"
            cx={WIDTH / 2}
            cy={0}
            r={510}
            gradientTransform={`translate(${WIDTH / 2} 0) scale(0.89 1) translate(${-WIDTH / 2} 0)`}
          >
            <stop offset="0" stopColor={background} stopOpacity={0} />
            <stop offset="0.78" stopColor={background} stopOpacity={0.66} />
          </radialGradient>
        </defs>

        {backdrop && (
          <rect
            width={WIDTH}
            height={HEIGHT}
            fill={background}
            fillOpacity={backdrop.dim / 100}
          />
        )}
        <rect width={WIDTH} height={HEIGHT} fill={`url(#${uid}-glow)`} />
        <rect width={WIDTH} height={HEIGHT} fill={`url(#${uid}-vignette)`} />

        <rect width={WIDTH} height={18} fill={top.color} />
        <rect y={17.4} width={WIDTH} height={0.6} {...topBorder} />
        <rect
          x={7}
          y={4}
          width={10}
          height={10}
          rx={2.5}
          fill={top.foreground}
        />
        <rect
          x={21}
          y={7.5}
          width={44}
          height={3.5}
          rx={1.75}
          fill={top.muted}
        />
        <rect
          x={156}
          y={7}
          width={34}
          height={4}
          rx={2}
          fill={top.foreground}
        />
        <rect
          x={474}
          y={3.5}
          width={12}
          height={11}
          rx={3}
          fill={top.surface2}
        />
        <rect
          x={490}
          y={3.5}
          width={12}
          height={11}
          rx={3}
          fill={top.surface2}
        />
        <rect
          x={508}
          y={3.5}
          width={94}
          height={11}
          rx={3}
          fill={top.surface2}
        />
        <rect
          x={516}
          y={7.75}
          width={40}
          height={2.5}
          rx={1.25}
          fill={top.faint}
        />

        <rect
          x={0}
          y={18}
          width={124}
          height={HEIGHT - 18}
          fill={side.color}
          {...panel}
        />
        <rect x={124} y={18} width={0.6} height={HEIGHT - 18} {...sideBorder} />
        <rect
          x={5}
          y={23}
          width={114}
          height={17}
          rx={4}
          fill={mixHex(side.surface2, side.primary, 0.22)}
        />
        <rect
          x={11}
          y={28.5}
          width={6}
          height={6}
          rx={1.5}
          fill={side.foreground}
        />
        <rect
          x={22}
          y={29.5}
          width={26}
          height={4}
          rx={2}
          fill={side.foreground}
        />
        {NAV_ROWS.map((width, index) => {
          const y = 41 + index * 18;
          return (
            <g key={y}>
              <rect
                x={11}
                y={y + 5.5}
                width={6}
                height={6}
                rx={1.5}
                fill={side.muted}
              />
              <rect
                x={22}
                y={y + 6.5}
                width={width}
                height={4}
                rx={2}
                fill={side.muted}
              />
            </g>
          );
        })}
        <rect x={10} y={123} width={24} height={3} rx={1.5} fill={side.faint} />
        {DOCK_ROWS.map((width, index) => {
          const y = 134 + index * 21;
          return (
            <g key={y}>
              <rect
                x={9}
                y={y}
                width={13}
                height={13}
                rx={3}
                fill={icon(index)}
              />
              <rect
                x={27}
                y={y + 2.5}
                width={width}
                height={4}
                rx={2}
                fill={side.foreground}
              />
              <rect
                x={27}
                y={y + 9}
                width={20}
                height={2.5}
                rx={1.25}
                fill={side.faint}
              />
            </g>
          );
        })}
        <rect x={0} y={328} width={124} height={0.6} {...sideBorder} />
        <rect
          x={8}
          y={334}
          width={16}
          height={16}
          rx={3}
          fill={side.surface3}
        />
        <rect
          x={29}
          y={337}
          width={30}
          height={2.5}
          rx={1.25}
          fill={side.faint}
        />
        <rect
          x={29}
          y={343}
          width={42}
          height={4}
          rx={2}
          fill={side.foreground}
        />

        <rect
          x={132}
          y={24}
          width={500}
          height={96}
          rx={7}
          fill={palette.surface2}
          {...panel}
        />
        <rect x={141} y={32} width={26} height={26} rx={5} fill={icon(1)} />
        <rect x={174} y={36} width={72} height={7} rx={3.5} fill={foreground} />
        <rect
          x={251}
          y={35}
          width={32}
          height={9}
          rx={4.5}
          fill={palette.surface3}
        />
        <rect
          x={174}
          y={49}
          width={110}
          height={3.5}
          rx={1.75}
          fill={palette.muted}
        />
        {[
          [141, 30, 34],
          [189, 24, 16],
          [230, 44, 26],
          [300, 34, 30],
        ].map(([x, label, value]) => (
          <g key={x}>
            <rect
              x={x}
              y={67}
              width={label}
              height={2.5}
              rx={1.25}
              fill={palette.faint}
            />
            <rect
              x={x}
              y={73}
              width={value}
              height={5}
              rx={2.5}
              fill={foreground}
            />
          </g>
        ))}
        <rect
          x={141}
          y={88}
          width={69}
          height={20}
          rx={4.5}
          fill={palette.primary}
        />
        <path d="M150 93.5 L150 102.5 L157.5 98 Z" fill={palette.primaryText} />
        <rect
          x={161}
          y={96}
          width={32}
          height={4}
          rx={2}
          fill={palette.primaryText}
        />
        {[215, 239, 263].map((x) => (
          <rect
            key={x}
            x={x}
            y={88}
            width={20}
            height={20}
            rx={4.5}
            fill={palette.surface3}
          />
        ))}
        <rect x={488} y={32} width={0.6} height={80} {...border} />
        <rect
          x={496}
          y={35}
          width={36}
          height={3}
          rx={1.5}
          fill={palette.faint}
        />
        {[47, 72].map((y) => (
          <g key={y}>
            <rect
              x={496}
              y={y}
              width={10}
              height={10}
              rx={5}
              fill={palette.surface3}
            />
            <rect
              x={511}
              y={y + 1}
              width={40}
              height={3.5}
              rx={1.75}
              fill={foreground}
            />
            <rect
              x={511}
              y={y + 7}
              width={24}
              height={2.5}
              rx={1.25}
              fill={palette.faint}
            />
          </g>
        ))}

        <rect
          x={132}
          y={126}
          width={112}
          height={17}
          rx={4}
          fill={palette.surface2}
          {...panel}
        />
        <rect
          x={142}
          y={133}
          width={44}
          height={3}
          rx={1.5}
          fill={palette.faint}
        />
        <rect
          x={249}
          y={126}
          width={48}
          height={17}
          rx={4}
          fill={palette.surface2}
          {...panel}
        />
        <rect
          x={302}
          y={126}
          width={66}
          height={17}
          rx={4}
          fill={palette.surface2}
          {...panel}
        />
        <rect
          x={563}
          y={126}
          width={69}
          height={17}
          rx={4}
          fill={palette.surface2}
          {...panel}
        />

        {CARD_NAMES.map((name, index) => {
          const x = CARD_COLUMNS[index % 4];
          const y = index < 4 ? 149 : 255;
          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={120.5}
                height={100}
                rx={6}
                fill={palette.surface2}
                {...panel}
              />
              <path
                d={`M${x} ${y + 54} V${y + 6} Q${x} ${y} ${x + 6} ${y} H${x + 114.5} Q${x + 120.5} ${y} ${x + 120.5} ${y + 6} V${y + 54} Z`}
                fill={thumb}
                fillOpacity={panelOpacity}
              />
              <rect
                x={x + 48.25}
                y={y + 15}
                width={24}
                height={24}
                rx={5}
                fill={icon(index)}
              />
              <rect
                x={x + 6}
                y={y + 62}
                width={name}
                height={5}
                rx={2.5}
                fill={foreground}
              />
              <circle cx={x + 8} cy={y + 76} r={1.75} fill={palette.muted} />
              <rect
                x={x + 12}
                y={y + 74.75}
                width={50}
                height={2.5}
                rx={1.25}
                fill={palette.muted}
              />
              {index === 0 && (
                <rect
                  x={x + 0.75}
                  y={y + 0.75}
                  width={119}
                  height={98.5}
                  rx={5.5}
                  fill="none"
                  stroke={palette.primary}
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
