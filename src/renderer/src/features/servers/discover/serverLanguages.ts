const SERVER_LANGUAGES = (
  "en es pt fr de it nl ru uk pl cs sk hu ro bg hr sr el tr ar he hi bn ur zh " +
  "ja ko th vi id ms tl sv no da fi lt lv et af am az be bs ca eo eu fa ga gl " +
  "hy is ka kk km kn lo mk ml mn mr my ne pa si sl sq sw ta te uz yo zu"
).split(" ");

export function languageName(code: string, uiLanguage: string): string {
  try {
    const name = new Intl.DisplayNames([uiLanguage, "en"], {
      type: "language",
    }).of(code);
    if (!name) return code;

    return name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1);
  } catch {
    return code;
  }
}

export function languageOptions(
  uiLanguage: string,
): { value: string; label: string }[] {
  const rank = (code: string) =>
    code === uiLanguage ? 0 : code === "en" ? 1 : 2;

  return SERVER_LANGUAGES.map((code) => ({
    value: code,
    label: languageName(code, uiLanguage),
  })).sort(
    (left, right) =>
      rank(left.value) - rank(right.value) ||
      left.label.localeCompare(right.label, uiLanguage),
  );
}
