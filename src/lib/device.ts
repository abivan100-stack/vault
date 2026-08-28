/**
 * The probe's own HTTP interface.
 *
 * The buzzer is on the device, not in this tab, so silencing it is a request
 * to the device rather than a piece of local state. The Vault API cannot
 * carry it: the firmware posts readings up and never polls for commands, so
 * the browser has to reach the board directly.
 *
 * That makes the address a deployment detail — a board on a bench has a
 * different one from a board in a van — so it is configured rather than
 * assumed. With nothing configured the console behaves exactly as before and
 * the acknowledge control is not offered at all, which is honest: there is no
 * buzzer within reach to pause.
 */

/** How long to wait before deciding the board is not answering. */
export const ACK_TIMEOUT_MS = 4_000;

/**
 * The configured device address, or null.
 *
 * Parsed rather than prefix-matched: "http" satisfies `startsWith` and is not
 * an address, and a trailing slash would produce `//ack`. Anything that is not
 * a usable http(s) origin reads as "no device", which is the state the UI
 * already knows how to show.
 */
export function normaliseDeviceUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // The origin, not the string that was given. A value carrying a path,
    // query or fragment would otherwise have `/ack` appended to it and the
    // request would land somewhere else -- or inside a query string.
    return url.origin;
  } catch {
    return null;
  }
}

/** The address this build was given, if any. */
export function deviceUrl(): string | null {
  return normaliseDeviceUrl(import.meta.env.VITE_VAULT_DEVICE_URL);
}

export type AckResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Asks the device to silence its buzzer.
 *
 * Reports failure rather than throwing, because every caller has to say
 * something to the operator either way, and an alarm that is still sounding
 * is the one case where "it didn't work" must not be swallowed. The device
 * re-arms itself on the next breach; this pauses the current one.
 */
export async function acknowledgeAlarm(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = ACK_TIMEOUT_MS,
): Promise<AckResult> {
  if (!base) return { ok: false, message: "No device is configured for this console." };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${base}/ack`, { method: "POST", signal: abort.signal });
    if (!response.ok) {
      return { ok: false, message: `The device refused the acknowledgement (${response.status}).` };
    }
    return { ok: true };
  } catch {
    // A board on another network, asleep, or moved is the ordinary case here,
    // not an exceptional one.
    return { ok: false, message: "Could not reach the device. The buzzer is still sounding." };
  } finally {
    clearTimeout(timer);
  }
}
