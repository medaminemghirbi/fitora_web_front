/**
 * The API masks other people's e-mail addresses ("ex****le@gmail.com",
 * backend EmailMask). A value like that is never a real address: a form
 * must not send it back over the real one.
 */
export function isMaskedEmail(value: string | null | undefined): boolean {
  return !!value && value.includes("****");
}
