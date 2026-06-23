const api = window.api;

export function Titlebar() {
  if (api.platform !== "win32") return null;

  return (
    <div className="app-drag flex h-9 shrink-0 select-none items-center bg-background pl-3">
      <span className="text-xs font-medium tracking-wide text-muted-foreground">
        Grubie Launcher
      </span>
    </div>
  );
}
