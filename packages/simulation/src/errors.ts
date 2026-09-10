/** Rejected caller-supplied gameplay parameter. Safe for a 400 response. */
export class ValidationError extends Error {
  readonly name = 'ValidationError';
}
/** Invalid persisted or server-supplied domain data. Never a user-parameter 400. */
export class ProtocolError extends Error {
  readonly name = 'ProtocolError';
}
