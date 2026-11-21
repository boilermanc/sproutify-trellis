const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

function firstMarkerIndex(value: string, patterns: RegExp[]): number {
  let earliest = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match && (earliest < 0 || match.index < earliest)) earliest = match.index;
  }
  return earliest;
}

/**
 * Keep only the lead's newly written reply. Email providers usually include the
 * entire quoted thread in the plain-text MIME part, which is useful for a mail
 * client but noisy in Trellis and in internal reply notifications.
 */
export function extractLatestReply(value: string, maxLength = 4000): string {
  let reply = normalizeNewlines(value).trim();
  if (!reply) return "";

  const quotedIndex = firstMarkerIndex(reply, [
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*_{5,}\s*$/m,
    /^\s*On .+wrote:\s*$/im,
    /^\s*From:\s.+$/im,
    /^\s*>/m,
  ]);
  if (quotedIndex > 0) reply = reply.slice(0, quotedIndex).trim();

  // Common signature dividers. Preserve a simple sign-off/name before them.
  const signatureIndex = firstMarkerIndex(reply, [
    /^\s*\*{5,}\s*$/m,
    /^\s*--\s*$/m,
  ]);
  if (signatureIndex > 0) reply = reply.slice(0, signatureIndex).trim();

  return reply.replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength);
}

/** Convert a received HTML body to readable text when no text MIME part exists. */
export function receivedHtmlToText(value: string): string {
  return normalizeNewlines(value)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function emailList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .flatMap((item) => String(item).split(","))
    .map((item) => {
      const angleAddress = item.match(/<([^>]+)>/);
      return String(angleAddress?.[1] || item).trim().toLowerCase();
    })
    .filter(Boolean);
}
