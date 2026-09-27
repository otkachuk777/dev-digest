/**
 * DOMAIN — pure. No fetch, no MCP SDK, no I/O. The single error shape every
 * other ring maps to/from: the adapter turns fetch/HTTP failures into it,
 * usecases propagate it, and `server.ts` turns it into a tool's `isError` text.
 */

export type DevDigestErrorKind =
  | 'not_found'
  | 'unreachable'
  | 'rate_limited'
  | 'invalid'
  | 'server';

export class DevDigestError extends Error {
  readonly kind: DevDigestErrorKind;

  constructor(kind: DevDigestErrorKind, message: string) {
    super(message);
    this.name = 'DevDigestError';
    this.kind = kind;
  }
}

/** A `not_found` error whose message already leads the model forward. */
export function NotFound(hint: string): DevDigestError {
  return new DevDigestError('not_found', hint);
}
