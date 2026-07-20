const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SkyWindowPath = `/sky/${string}`;

function parseBlastId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const blastId = value.trim();
  return UUID_PATTERN.test(blastId) ? blastId : null;
}

export function skyWindowPath(blastId: string): SkyWindowPath {
  return `/sky/${blastId}`;
}

export function parseSkyWindowUrl(value: unknown): SkyWindowPath | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'mobile:') {
      return null;
    }

    const segments = [url.hostname, ...url.pathname.split('/')].filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'sky') {
      return null;
    }

    const blastId = parseBlastId(segments[1]);
    return blastId ? skyWindowPath(blastId) : null;
  } catch {
    return null;
  }
}

export function notificationDataToSkyWindowPath(
  data: Record<string, unknown> | undefined,
): SkyWindowPath | null {
  if (!data) {
    return null;
  }

  const blastId = parseBlastId(data.blast_id ?? data.blastId);
  if (blastId) {
    return skyWindowPath(blastId);
  }

  return parseSkyWindowUrl(data.url);
}
