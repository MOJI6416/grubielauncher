export function BrandMark({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="148 132 212 248"
      aria-hidden
      focusable="false"
      className={className}
    >
      <g fill="currentColor">
        <rect x="148" y="132" width="212" height="52" />
        <rect x="148" y="132" width="52" height="248" />
        <rect x="148" y="328" width="212" height="52" />
        <rect x="308" y="228" width="52" height="152" />
        <rect x="252" y="228" width="108" height="52" />
      </g>
      <rect
        x="252"
        y="228"
        width="56"
        height="52"
        fill="var(--color-primary)"
      />
    </svg>
  );
}
