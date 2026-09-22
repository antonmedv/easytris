/**
 * Marks a branch the type system believes is unreachable. Passing a value whose
 * union still has unhandled members is a compile error, so a switch that grows a
 * new case fails the build instead of silently ignoring it.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
