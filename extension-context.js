export function isExtensionContextInvalidatedError(error) {
  return error instanceof Error && /extension context invalidated/i.test(error.message)
}
