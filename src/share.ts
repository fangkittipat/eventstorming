export function readHash(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash.includes("=") ? hash : `s=${hash}`);
  const src = params.get("s");
  if (!src) return null;
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

export function writeHash(source: string) {
  const next = `#s=${encodeURIComponent(source)}`;
  if (window.location.hash === next) return;
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
}

export function shareUrl(source: string): string {
  return `${window.location.origin}${window.location.pathname}#s=${encodeURIComponent(source)}`;
}
