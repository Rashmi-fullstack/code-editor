import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAgentResult,
  salvageTruncatedOperations,
  auditAndCleanupProject,
  selectProjectContext,
  buildFullCodingAgentSystemPrompt,
  HuggingFaceQuotaError,
  HuggingFaceAuthError,
  HuggingFaceRateLimitError,
  HuggingFaceUnavailableError,
  MalformedAIResponseError,
} from './coding-agent';
import { DEVELOPER_IDE_CONFIG } from './developer-ide-config';
import { validateProjectForRuntime } from '../runtime/webcontainer-manager';

test('rejects incomplete Next.js project scaffolds', () => {
  assert.throws(
    () =>
      validateAgentResult(
        {
          summary: 'partial scaffold',
          operations: [
            { type: 'create', path: 'package.json', content: '{"name":"demo"}' },
            { type: 'create', path: 'next.config.ts', content: 'export default {}' },
          ],
        },
        []
      ),
    /incomplete project scaffold|missing|required|version|package.json/i
  );
});

test('rejects package.json without valid semver version', () => {
  assert.throws(
    () =>
      validateAgentResult(
        {
          summary: 'broken package',
          operations: [
            {
              type: 'create',
              path: 'package.json',
              content: JSON.stringify({
                name: 'demo-app',
                private: true,
                scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
                dependencies: { next: '^16.0.0' },
              }),
            },
            {
              type: 'create',
              path: 'app/page.tsx',
              content: 'export default function Page(){return <main />}',
            },
            {
              type: 'create',
              path: 'app/layout.tsx',
              content: 'export default function Layout({children}:{any}){return <html>{children}</html>}',
            },
          ],
        },
        []
      ),
    /version must be a valid semver|Invalid package.json/i
  );
});

test('accepts a full Next.js app scaffold', () => {
  const result = validateAgentResult(
    {
      summary: 'full app scaffold',
      operations: [
        {
          type: 'create',
          path: 'package.json',
          content: JSON.stringify({
            name: 'demo-app',
            version: '0.1.0',
            private: true,
            scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
            dependencies: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
          }),
        },
        { type: 'create', path: 'tsconfig.json', content: '{}' },
        { type: 'create', path: 'app/layout.tsx', content: 'export default function RootLayout(){return <html><body>hi</body></html>}' },
        { type: 'create', path: 'app/page.tsx', content: 'export default function Page(){return <main>hi</main>}' },
        { type: 'create', path: 'app/globals.css', content: 'body {}' },
      ],
    },
    []
  );

  assert.equal(result.summary, 'full app scaffold');
  assert.ok(result.operations.length >= 4);
});

test('rejects malformed generated projects before runtime boot', () => {
  const result = validateProjectForRuntime([
    {
      id: '1',
      project_id: 'project-1',
      name: 'package.json',
      path: 'package.json',
      content: JSON.stringify({
        name: 'broken-app',
        version: '0.1.0',
        private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '^16.0.0' },
      }),
      language: 'json',
      is_folder: false,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
    {
      id: '2',
      project_id: 'project-1',
      name: 'next.config.ts',
      path: 'next.config.ts',
      content: 'export default {}',
      language: 'typescript',
      is_folder: false,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ]);

  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /app\/page|app\/layout|Next\.js/i);
});

test('salvages complete operations from truncated JSON responses', () => {
  const truncatedJson = `{"summary":"Building Netflix clone","operations":[{"type":"create","path":"package.json","content":"{\\"name\\":\\"netflix\\",\\"version\\":\\"0.1.0\\"}"},{"type":"create","path":"app/page.tsx","content":"export default function Page(){return <div>Netflix</div>}"},{"type":"create","path":"app/components/Hero.tsx","content":"export def`;

  const salvaged = salvageTruncatedOperations(truncatedJson);
  assert.ok(salvaged);
  assert.equal(salvaged.operations.length, 2);
  assert.equal(salvaged.operations[0].path, 'package.json');
  assert.equal(salvaged.operations[1].path, 'app/page.tsx');
});

test('verifies Hugging Face error classes and user messages', () => {
  const quotaErr = new HuggingFaceQuotaError();
  assert.equal(quotaErr.status, 402);
  assert.equal(quotaErr.message, 'Hugging Face API credits or balance is insufficient. Please check billing or token settings.');

  const authErr = new HuggingFaceAuthError();
  assert.equal(authErr.status, 401);
  assert.equal(authErr.message, 'Hugging Face API authentication failed. Check the server-side HF_TOKEN configuration.');

  const rateLimitErr = new HuggingFaceRateLimitError();
  assert.equal(rateLimitErr.status, 429);
  assert.equal(rateLimitErr.message, 'Hugging Face API rate limit reached. Please retry shortly.');

  const unavailErr = new HuggingFaceUnavailableError();
  assert.equal(unavailErr.status, 503);
  assert.equal(unavailErr.message, 'Hugging Face Inference Provider is temporarily unavailable. Please retry.');

  const malformedErr = new MalformedAIResponseError();
  assert.equal(malformedErr.status, 422);
  assert.equal(malformedErr.message, 'AI returned an invalid project response. Retrying with a safer generation format.');

  assert.equal(DEVELOPER_IDE_CONFIG.provider, 'huggingface');
  assert.equal(DEVELOPER_IDE_CONFIG.model, 'Qwen/Qwen3-Coder-480B-A35B-Instruct');
  assert.equal(DEVELOPER_IDE_CONFIG.displayName, 'Qwen3-Coder • Hugging Face');
  assert.equal(DEVELOPER_IDE_CONFIG.fallbackProvider, 'google-gemini');
});

test('auditAndCleanupProject strips unreferenced dependencies and cleans unused components', () => {
  const existingFiles = [
    {
      id: 'pkg',
      project_id: 'p1',
      name: 'package.json',
      path: 'package.json',
      content: JSON.stringify({
        name: 'test-app',
        version: '0.1.0',
        dependencies: {
          next: '14.2.24',
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          'lucide-react': '^0.460.0',
          'unused-foo-lib': '^1.0.0',
          'unused-bar-icons': '^2.0.0',
        },
      }),
      language: 'json',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      id: 'page',
      project_id: 'p1',
      name: 'page.tsx',
      path: 'app/page.tsx',
      content: `import { Search } from 'lucide-react';\nimport { Hero } from '@/components/Hero';\nexport default function Page() { return <Hero />; }`,
      language: 'typescript',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      id: 'hero',
      project_id: 'p1',
      name: 'Hero.tsx',
      path: 'components/Hero.tsx',
      content: `export function Hero() { return <h1>Hero</h1>; }`,
      language: 'typescript',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      id: 'dead',
      project_id: 'p1',
      name: 'ObsoleteDemo.tsx',
      path: 'components/ObsoleteDemo.tsx',
      content: `export function ObsoleteDemo() { return <div>Dead</div>; }`,
      language: 'typescript',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
  ];

  const operations: Array<{ type: string; path: string; content?: string }> = [];
  const result = auditAndCleanupProject(operations as any, existingFiles, [
    { name: 'next', version: '14.2.24' },
    { name: 'lucide-react', version: '^0.460.0' },
    { name: 'unused-foo-lib', version: '^1.0.0' },
    { name: 'unused-bar-icons', version: '^2.0.0' },
  ]);

  // Unreferenced dependencies removed from report and operations
  assert.ok(result.cleanupReport.removedDeps.includes('unused-foo-lib'));
  assert.ok(result.cleanupReport.removedDeps.includes('unused-bar-icons'));

  // Unused obsolete component safely scheduled for deletion
  assert.ok(result.cleanupReport.removedFiles.includes('components/ObsoleteDemo.tsx'));
  assert.ok(result.operations.some((op) => op.type === 'delete' && op.path === 'components/ObsoleteDemo.tsx'));
});

test('allows incremental updates when package.json is in existingFiles but not in operations', () => {
  const existingFiles = [
    {
      id: 'pkg',
      project_id: 'p1',
      name: 'package.json',
      path: 'package.json',
      content: JSON.stringify({
        name: 'test-app',
        version: '0.1.0',
        dependencies: { next: '14.2.24', react: '^18.3.1', 'react-dom': '^18.3.1' },
      }),
      language: 'json',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      id: 'layout',
      project_id: 'p1',
      name: 'layout.tsx',
      path: 'app/layout.tsx',
      content: 'export default function Layout({children}:{children:any}){return <html><body>{children}</body></html>}',
      language: 'typescript',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    {
      id: 'page',
      project_id: 'p1',
      name: 'page.tsx',
      path: 'app/page.tsx',
      content: 'export default function Page(){return <div>Old</div>}',
      language: 'typescript',
      is_folder: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
  ];

  // AI only generated an update to app/page.tsx and a new component, without package.json
  const res = validateAgentResult(
    {
      summary: 'Update hero component',
      operations: [
        { type: 'update', path: 'app/page.tsx', content: 'export default function Page(){return <div>New</div>}' },
        { type: 'create', path: 'components/Hero.tsx', content: 'export function Hero(){return <h1>Hero</h1>}' },
      ],
    },
    existingFiles as any
  );

  assert.ok(res);
  assert.equal(res.operations.length, 2);
  assert.ok(res.operations.some((op) => op.path === 'app/page.tsx'));
  assert.ok(res.operations.some((op) => op.path === 'components/Hero.tsx'));
});

test('auto-injects package.json and layout.tsx when first generation creates Next.js page', () => {
  // Empty existing files
  const existingFiles: any[] = [];

  // AI only generated app/page.tsx and components/Hero.tsx
  const res = validateAgentResult(
    {
      summary: 'Build Netflix clone',
      operations: [
        { type: 'create', path: 'app/page.tsx', content: 'export default function Page(){return <div>Netflix</div>}' },
        { type: 'create', path: 'components/Hero.tsx', content: 'export function Hero(){return <h1>Hero</h1>}' },
      ],
    },
    existingFiles
  );

  assert.ok(res);
  // package.json and app/layout.tsx should be auto-synthesized!
  assert.ok(res.operations.some((op) => op.path === 'package.json'));
  assert.ok(res.operations.some((op) => op.path === 'app/layout.tsx'));
  assert.ok(res.operations.some((op) => op.path === 'app/page.tsx'));
});

test('selectProjectContext forwards referenceImage and buildFullCodingAgentSystemPrompt includes visual asset rules', () => {
  const context = selectProjectContext(
    [],
    'app/page.tsx',
    undefined,
    undefined,
    'build',
    'data:image/png;base64,mockImageData'
  );

  assert.equal(context.referenceImage, 'data:image/png;base64,mockImageData');

  const systemPrompt = buildFullCodingAgentSystemPrompt(context);
  assert.match(systemPrompt, /REAL VISUAL ASSETS & IMAGERY STRATEGY/);
  assert.match(systemPrompt, /REFERENCE IMAGE CONTEXT/);
  assert.match(systemPrompt, /images\.unsplash\.com/);
});


