import { stripAnsi } from './webcontainer-manager';

/**
 * Classifies runtime and build messages to distinguish actual application fatal errors
 * (ReferenceError, TypeError, SyntaxError, Module not found, Missing export, etc.)
 * from normal development events (HMR, recompilations, installation progress, SWC notices).
 */
export function isApplicationFatalError(rawError: string): boolean {
  if (!rawError) return false;
  const error = stripAnsi(rawError);

  // Infrastructure, normal dev events, or transient notices that should NOT trigger auto-fix
  if (
    error.includes('compiled in') ||
    error.includes('Compiling /') ||
    error.includes('Fast Refresh') ||
    error.includes('ready in') ||
    error.includes('HMR') ||
    error.includes('webpack') ||
    error.includes('Watching for changes') ||
    error.includes('installing') ||
    error.includes('npm install') ||
    error.includes('ERR_DLOPEN_DISABLED') ||
    error.includes('fallback to wasm') ||
    error.includes('Falling back to WebAssembly') ||
    error.includes('Attempted to load @next/swc') ||
    error.includes('SharedArrayBuffer') ||
    error.includes('Cross-Origin Isolation')
  ) {
    return false;
  }

  // Genuine application errors that require AI self-healing
  return /ReferenceError|TypeError|SyntaxError|Cannot find module|Module not found|Export .* was not found|is not defined|is not a function|Failed to compile|Invalid component|Unhandled Runtime Error|Server Error|HTTP 500|500 Internal Server Error/i.test(
    error
  );
}
