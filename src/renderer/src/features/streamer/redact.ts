export const MASK = "••••••";
export const PATH_MASK = "•••";

const WINDOWS_PROFILE =
  /([A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+)[^\\/\r\n"'<>|:*?]+/gi;
const UNIX_PROFILE = /((?:^|[^\w.~-])\/(?:home|Users)\/)[^/\s"'<>]+/g;

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(
  `(?<![\\w.])${OCTET}(?:\\.${OCTET}){3}(?![\\w]|\\.\\d)`,
  "g",
);
const CONNECTING = /(Connecting to )([^\s,]+)(, ?\d+)/g;
const SERVER_ARGUMENT =
  /(--(?:quickPlayMultiplayer|server)[ =]+)("[^"]*"|\S+)/g;

export function redactPath(value: string): string {
  return value
    .replace(WINDOWS_PROFILE, `$1${PATH_MASK}`)
    .replace(UNIX_PROFILE, `$1${PATH_MASK}`);
}

export function redactText(value: string): string {
  return redactPath(value)
    .replace(CONNECTING, `$1${MASK}$3`)
    .replace(SERVER_ARGUMENT, `$1${MASK}`)
    .replace(IPV4, MASK);
}

export function maskValue(value: string): string {
  return value ? MASK : value;
}
