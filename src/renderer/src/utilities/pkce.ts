function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);

  return toBase64Url(bytes);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return toBase64Url(new Uint8Array(digest));
}
