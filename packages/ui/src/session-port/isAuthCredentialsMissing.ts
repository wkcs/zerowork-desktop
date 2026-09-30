/**
 * MVP-2 card B: detect Host SessionPort auth/BYOK guidance.
 * Host embeds stable code AUTH_CREDENTIALS_MISSING in error.message
 * (no new SessionUiEvent type).
 */

export const AUTH_CREDENTIALS_MISSING_SUBSTRING = "AUTH_CREDENTIALS_MISSING" as const;

/** True when Host error message carries the auth/BYOK stable code. */
export function isAuthCredentialsMissing(message: string): boolean {
  return message.includes(AUTH_CREDENTIALS_MISSING_SUBSTRING);
}
