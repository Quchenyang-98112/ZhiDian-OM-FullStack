/** Swallow rejected fire-and-forget promises; errors surface via adapter status or toasts. */
export function ignorePromiseRejection(): void {
  // intentional no-op — caller already surfaces failures via toast or adapter status
}
