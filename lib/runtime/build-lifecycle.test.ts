import test from 'node:test';
import assert from 'node:assert/strict';
import { isApplicationFatalError } from './error-classifier';
import { webcontainerManager } from '@/lib/runtime/webcontainer-manager';

test('isApplicationFatalError correctly filters normal dev events from actual application errors', () => {
  // Normal dev events (should NOT trigger auto-fix)
  assert.equal(isApplicationFatalError('compiled in 24.1s'), false);
  assert.equal(isApplicationFatalError('Compiling /app/page.tsx'), false);
  assert.equal(isApplicationFatalError('Fast Refresh active'), false);
  assert.equal(isApplicationFatalError('HMR update requested'), false);
  assert.equal(isApplicationFatalError('npm install --include=optional'), false);
  assert.equal(isApplicationFatalError('ERR_DLOPEN_DISABLED: falling back to wasm'), false);
  assert.equal(isApplicationFatalError('SharedArrayBuffer isolation check'), false);

  // Actual fatal application errors (MUST trigger auto-fix)
  assert.equal(isApplicationFatalError('ReferenceError: activeItem is not defined'), true);
  assert.equal(isApplicationFatalError('TypeError: Cannot read property of undefined (reading "map")'), true);
  assert.equal(isApplicationFatalError('SyntaxError: Unexpected token < in JSON at position 0'), true);
  assert.equal(isApplicationFatalError('Module not found: Can\'t resolve "@/components/Hero" in "/app"'), true);
  assert.equal(isApplicationFatalError('Cannot find module \'lucide-react\''), true);
  assert.equal(isApplicationFatalError('Export "Header" was not found in "@/components/Header"'), true);
  assert.equal(isApplicationFatalError('Failed to compile: Error in app/page.tsx'), true);
  assert.equal(isApplicationFatalError('Unhandled Runtime Error: 500 Internal Server Error'), true);
});

test('webcontainerManager provides internal logging and dev server status check', () => {
  assert.equal(typeof webcontainerManager.logInternal, 'function');
  assert.equal(typeof webcontainerManager.isDevServerRunning, 'function');

  // Verify internal logging formats and logs
  webcontainerManager.logInternal('BUILD', 'started');
  webcontainerManager.logInternal('PERF', 'generation: 1.2s, file-sync: 0.2s');

  const logs = webcontainerManager.getLogs();
  assert.ok(logs.some((l) => l.includes('[BUILD] started')));
  assert.ok(logs.some((l) => l.includes('[PERF] generation: 1.2s')));
});
