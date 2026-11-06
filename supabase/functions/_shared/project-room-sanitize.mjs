export function sanitizePII(value, max = 24000) {
  return String(value ?? "")
    .slice(0, max)
    .replace(/\r\n/g, "\n")
    .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, "[REDACTED_CC]")
    .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[REDACTED_ID]")
    .replace(
      /\b(?:sk|xai|key|token)[-_][A-Za-z0-9_-]{20,}\b/gi,
      "[REDACTED_TOKEN]",
    );
}
