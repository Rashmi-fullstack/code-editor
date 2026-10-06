import type { ProjectFile } from '@/lib/types/database';
import { HfInference } from '@huggingface/inference';
import { DEVELOPER_IDE_CONFIG } from './developer-ide-config';
import { logProviderEvent, logSystemError } from '@/lib/admin/telemetry';

export type FileOperation =
  | { type: 'create' | 'update'; path: string; content: string; language?: string }
  | { type: 'delete'; path: string }
  | { type: 'rename'; path: string; newPath: string };

export type AgentResult = {
  summary: string;
  operations: FileOperation[];
  dependencies?: Array<{ name: string; version: string }>;
  assets?: Array<{ id: string; type: string; description: string; path?: string }>;
  plan?: string[];
  cleanupReport?: { removedFiles: string[]; removedDeps: string[] };
};

export class GeminiUnavailableError extends Error {
  status = 503;
  constructor(
    message = 'Gemini is temporarily unavailable. The model is experiencing high demand. Retried automatically; please try again shortly.'
  ) {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

export class GeminiQuotaError extends Error {
  status = 429;
  constructor(
    message = 'Gemini API quota has been exceeded for the configured API key/project. Check Gemini API usage and billing/quota settings.'
  ) {
    super(message);
    this.name = 'GeminiQuotaError';
  }
}

export class HuggingFaceUnavailableError extends Error {
  status = 503;
  constructor(
    message = 'Hugging Face Inference Provider is temporarily unavailable. Please retry.'
  ) {
    super(message);
    this.name = 'HuggingFaceUnavailableError';
  }
}

export class HuggingFaceQuotaError extends Error {
  status = 402;
  constructor(
    message = 'Hugging Face API credits or balance is insufficient. Please check billing or token settings.'
  ) {
    super(message);
    this.name = 'HuggingFaceQuotaError';
  }
}

export class HuggingFaceAuthError extends Error {
  status = 401;
  constructor(
    message = 'Hugging Face API authentication failed. Check the server-side HF_TOKEN configuration.'
  ) {
    super(message);
    this.name = 'HuggingFaceAuthError';
  }
}

export class HuggingFaceRateLimitError extends Error {
  status = 429;
  constructor(
    message = 'Hugging Face API rate limit reached. Please retry shortly.'
  ) {
    super(message);
    this.name = 'HuggingFaceRateLimitError';
  }
}

export class MalformedAIResponseError extends Error {
  status = 422;
  constructor(
    message = 'AI returned an invalid project response. Retrying with a safer generation format.'
  ) {
    super(message);
    this.name = 'MalformedAIResponseError';
  }
}

export const DEFAULT_GEMINI_MODEL = DEVELOPER_IDE_CONFIG.fallbackModel;
export const DEFAULT_HF_MODEL = DEVELOPER_IDE_CONFIG.model;
export const MAX_GEMINI_RETRIES = 3;
export const MAX_HF_RETRIES = 3;

const NPM_PACKAGE_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

function cleanPath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();
}

function sanitizeGeneratedContent(path: string, content: string): string {
  if (!content || !/\.(tsx|jsx|ts|js)$/.test(path)) return content;

  let next = content;

  // Fix any accidental bare Example identifiers in hook dependencies or expressions
  next = next.replace(/,\s*Example\s*\)/g, ', [])');

  // Prevent non-deterministic values from causing hydration drift in generated pages
  next = next.replace(/Math\.random\s*\(/g, '0');
  next = next.replace(/Date\.now\s*\(/g, '1700000000000');
  next = next.replace(/new Date\s*\(\s*\)/g, 'new Date("2025-01-01T00:00:00.000Z")');
  next = next.replace(/\.toLocaleDateString\s*\(\s*\)/g, '.toLocaleDateString()');
  next = next.replace(/toLocaleDateString\s*\(\s*\)/g, '"Jan 1, 2025"');

  if (/^(app\/page\.(tsx|jsx)|pages\/index\.(tsx|jsx))$/.test(path)) {
    const prefersRoot = /(return\s*\(\s*<)(main|div|section|article)/m;
    if (prefersRoot.test(next) && !/suppressHydrationWarning/.test(next)) {
      next = next.replace(/<(main|div|section|article)\b/g, '<$1 suppressHydrationWarning');
    }
  }

  if (/^(app\/layout\.(tsx|jsx)|pages\/_app\.(tsx|jsx))$/.test(path) && !/suppressHydrationWarning/.test(next)) {
    next = next.replace(/<body\b/g, '<body suppressHydrationWarning');
  }

  return next;
}

function assertCompleteProjectScaffold(paths: string[], existingFiles: ProjectFile[] = []) {
  const combined = [
    ...paths,
    ...existingFiles.filter((f) => !f.is_folder).map((f) => cleanPath(f.path)),
  ];

  const relevant = combined.filter(
    (path) =>
      path === 'package.json' ||
      path.endsWith('/package.json') ||
      path.startsWith('app/') ||
      path.startsWith('src/') ||
      path === 'index.html' ||
      path.endsWith('/index.html') ||
      path === 'vite.config.ts' ||
      path.endsWith('/vite.config.ts') ||
      path === 'next.config.ts' ||
      path.endsWith('/next.config.ts') ||
      path === 'next.config.mjs' ||
      path.endsWith('/next.config.mjs') ||
      path === 'next.config.js' ||
      path.endsWith('/next.config.js')
  );

  if (relevant.length === 0) return;

  const hasPackage = relevant.some((path) => path === 'package.json' || path.endsWith('/package.json'));
  const hasEntry = relevant.some((path) => {
    const normalized = path.replace(/^.*\//, '');
    return (
      normalized === 'page.tsx' ||
      normalized === 'page.jsx' ||
      normalized === 'page.js' ||
      normalized === 'App.tsx' ||
      normalized === 'App.jsx' ||
      normalized === 'main.tsx' ||
      normalized === 'main.jsx' ||
      normalized === 'index.html'
    );
  });
  const hasNextAppRouterLayout = relevant.some((path) => /(^|\/)layout\.(tsx|jsx|ts|js)$/.test(path));

  if (!hasPackage) {
    throw new Error('Incomplete project scaffold: missing required package.json file.');
  }

  if (!hasEntry) {
    throw new Error('Incomplete project scaffold: missing the app entry file (app/page.tsx, src/App.tsx, or index.html).');
  }

  if ((relevant.some((path) => path.startsWith('app/')) || relevant.some((path) => path.includes('/app/'))) && !hasNextAppRouterLayout) {
    throw new Error('Incomplete project scaffold: missing app/layout.tsx required for a valid Next.js app-router project.');
  }
}

function assertValidPackageJson(path: string, content: string) {
  const pkgPath = cleanPath(path);
  const isPackageJson = pkgPath === 'package.json' || pkgPath.endsWith('/package.json');
  if (!isPackageJson) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid package.json syntax at ${pkgPath}.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid package.json at ${pkgPath}.`);
  }

  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
  if (!name) throw new Error(`Invalid package.json at ${pkgPath}: missing a valid name field.`);
  if (!version || !/^\d+\.\d+\.\d+([-.A-Za-z0-9]+)?$/.test(version)) {
    throw new Error(`Invalid package.json at ${pkgPath}: version must be a valid semver string, not "${version || 'undefined'}".`);
  }

  const scripts = (parsed.scripts ?? {}) as Record<string, unknown>;
  const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) } as Record<string, unknown>;
  const hasNextDependency = Boolean(deps.next);
  if (hasNextDependency) {
    if (typeof scripts.dev !== 'string' || typeof scripts.build !== 'string' || typeof scripts.start !== 'string') {
      throw new Error(`Invalid package.json at ${pkgPath}: Next.js projects require dev, build, and start scripts.`);
    }
  }
}

export function auditAndCleanupProject(
  operations: FileOperation[],
  existingFiles: ProjectFile[],
  dependencies: Array<{ name: string; version: string }> = []
): {
  operations: FileOperation[];
  dependencies: Array<{ name: string; version: string }>;
  cleanupReport: { removedFiles: string[]; removedDeps: string[] };
} {
  const removedFiles: string[] = [];
  const removedDeps: string[] = [];

  // Build the state of files after applying the operations
  const fileMap = new Map<string, string>();
  for (const f of existingFiles) {
    if (!f.is_folder && f.content !== undefined) {
      fileMap.set(f.path, f.content);
    }
  }
  for (const op of operations) {
    if (op.type === 'create' || op.type === 'update') {
      fileMap.set(op.path, op.content);
    } else if (op.type === 'delete') {
      fileMap.delete(op.path);
    } else if (op.type === 'rename') {
      const prev = fileMap.get(op.path);
      fileMap.delete(op.path);
      if (prev !== undefined) {
        fileMap.set(op.newPath, prev);
      }
    }
  }

  // 1. Audit and clean package.json dependencies
  const PROTECTED_PACKAGES = new Set([
    'next',
    'react',
    'react-dom',
    '@next/swc-wasm-nodejs',
    'typescript',
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'tailwindcss',
    'postcss',
    'autoprefixer',
    'eslint',
    'eslint-config-next',
    'lucide-react',
  ]);

  const pkgJsonRaw = fileMap.get('package.json');
  let nextDependencies = Array.isArray(dependencies) ? [...dependencies] : [];

  if (pkgJsonRaw) {
    try {
      const parsed = JSON.parse(pkgJsonRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        [k: string]: unknown;
      };

      const allCode = Array.from(fileMap.entries())
        .filter(([p]) => p !== 'package.json' && !p.endsWith('.lock') && !p.endsWith('.json'))
        .map(([, c]) => c)
        .join('\n');

      let pkgModified = false;

      const checkAndCleanDepMap = (depsObj?: Record<string, string>) => {
        if (!depsObj) return;
        for (const depName of Object.keys(depsObj)) {
          if (PROTECTED_PACKAGES.has(depName)) continue;

          // Check if package is referenced in code: from 'dep', from "dep", require('dep'), import('dep')
          const escaped = depName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`['"]${escaped}(?:/[^'"]*)?['"]`, 'i');
          const isUsed = regex.test(allCode);

          if (!isUsed) {
            delete depsObj[depName];
            removedDeps.push(depName);
            pkgModified = true;
          }
        }
      };

      checkAndCleanDepMap(parsed.dependencies);
      checkAndCleanDepMap(parsed.devDependencies);

      if (pkgModified) {
        const cleanedPkg = JSON.stringify(parsed, null, 2);
        fileMap.set('package.json', cleanedPkg);

        // Update or add the package.json operation
        const existingPkgOpIndex = operations.findIndex((op) => op.path === 'package.json');
        if (existingPkgOpIndex !== -1) {
          operations[existingPkgOpIndex] = {
            type: 'update',
            path: 'package.json',
            content: cleanedPkg,
            language: 'json',
          };
        } else {
          operations.push({
            type: 'update',
            path: 'package.json',
            content: cleanedPkg,
            language: 'json',
          });
        }

        // Also clean up dependencies list
        nextDependencies = nextDependencies.filter((d) => !removedDeps.includes(d.name));
      }
    } catch (e) {
      console.warn('[Audit] package.json parse error during cleanup:', e);
    }
  }

  // 2. Audit and clean obsolete / abandoned files
  const PROTECTED_FILE_PATTERNS = [
    /^app\/layout\.(tsx|jsx|ts|js)$/,
    /^app\/page\.(tsx|jsx|ts|js)$/,
    /^app\/globals\.css$/,
    /^app\/favicon\.ico$/,
    /^app\/.*\/page\.(tsx|jsx|ts|js)$/,
    /^app\/.*\/layout\.(tsx|jsx|ts|js)$/,
    /^app\/.*\/route\.(ts|js)$/,
    /^app\/.*\/loading\.(tsx|jsx|ts|js)$/,
    /^app\/.*\/error\.(tsx|jsx|ts|js)$/,
    /^app\/.*\/not-found\.(tsx|jsx|ts|js)$/,
    /^pages\//,
    /^public\//,
    /^package\.json$/,
    /^tsconfig\.json$/,
    /^next\.config\./,
    /^vite\.config\./,
    /^index\.html$/,
    /^\.env/,
    /^README\.md$/i,
    /^tailwind\.config\./,
    /^postcss\.config\./,
  ];

  const newlyCreatedPaths = new Set(
    operations.filter((op) => op.type === 'create').map((op) => op.path)
  );

  const candidatePaths = Array.from(fileMap.keys()).filter((path) => {
    if (newlyCreatedPaths.has(path)) return false;
    if (PROTECTED_FILE_PATTERNS.some((pat) => pat.test(path))) return false;
    return path.startsWith('components/') || path.startsWith('lib/') || path.startsWith('utils/') || path.startsWith('hooks/');
  });

  const allRemainingCode = Array.from(fileMap.entries())
    .map(([p, c]) => ({ path: p, content: c }));

  for (const candPath of candidatePaths) {
    const fileBase = candPath.split('/').pop()?.replace(/\.(tsx|jsx|ts|js)$/, '') || '';
    if (!fileBase) continue;

    // Check if any other file imports candPath
    const isImported = allRemainingCode.some(({ path, content }) => {
      if (path === candPath) return false;
      const cleanCand = candPath.replace(/\.(tsx|jsx|ts|js)$/, '');
      return (
        content.includes(cleanCand) ||
        content.includes(`/${fileBase}`) ||
        content.includes(`'./${fileBase}'`) ||
        content.includes(`"${fileBase}"`) ||
        content.includes(`'@/components/${fileBase}'`) ||
        content.includes(`"@/components/${fileBase}"`)
      );
    });

    if (!isImported) {
      operations.push({
        type: 'delete',
        path: candPath,
      });
      removedFiles.push(candPath);
    }
  }

  return {
    operations,
    dependencies: nextDependencies,
    cleanupReport: { removedFiles, removedDeps },
  };
}

export function validateAgentResult(input: unknown, existingFiles: ProjectFile[]): AgentResult {
  if (!input || typeof input !== 'object') throw new Error('AI returned an invalid response.');
  const result = input as Partial<AgentResult>;
  const summary =
    typeof result.summary === 'string' && result.summary.trim()
      ? result.summary.slice(0, 2000)
      : 'Project files generated successfully.';

  if (!Array.isArray(result.operations)) {
    throw new Error('AI response did not include a change plan.');
  }

  // Filter out directory entries and invalid operations
  const rawOps = result.operations.filter(
    (op) =>
      Boolean(
        op &&
        typeof op === 'object' &&
        typeof (op as Record<string, unknown>).path === 'string' &&
        cleanPath((op as Record<string, unknown>).path as string).length > 0 &&
        !((op as Record<string, unknown>).path as string).endsWith('/')
      )
  );

  if (rawOps.length === 0 || rawOps.length > 60) {
    throw new Error('A generation must contain between 1 and 60 file operations.');
  }

  // Check if all paths are wrapped inside an arbitrary top-level directory (e.g. "my-app/package.json")
  let commonPrefix = '';
  const firstPath = cleanPath((rawOps[0] as Record<string, unknown>).path as string);
  const firstSlash = firstPath.indexOf('/');
  if (firstSlash > 0) {
    const candidate = firstPath.slice(0, firstSlash + 1);
    const standardRootFiles = [
      'package.json',
      'tsconfig.json',
      'README.md',
      'next.config.mjs',
      'next.config.ts',
      'next.config.js',
      'vite.config.ts',
      'index.html',
    ];
    if (
      rawOps.every((op) => cleanPath((op as Record<string, unknown>).path as string).startsWith(candidate)) &&
      rawOps.some((op) => standardRootFiles.includes(cleanPath((op as Record<string, unknown>).path as string).slice(candidate.length)))
    ) {
      commonPrefix = candidate;
    }
  }

  // Normalize paths removing any common top-level prefix
  for (const op of rawOps) {
    const o = op as Record<string, unknown>;
    let p = cleanPath(o.path as string);
    if (commonPrefix && p.startsWith(commonPrefix)) {
      p = p.slice(commonPrefix.length);
    }
    o.path = cleanPath(p);
  }

  const existingFilePaths = new Set(existingFiles.filter((f) => !f.is_folder).map((f) => cleanPath(f.path)));
  const opPaths = new Set(rawOps.map((op) => cleanPath((op as Record<string, unknown>).path as string)));

  const hasPackage =
    opPaths.has('package.json') ||
    existingFilePaths.has('package.json') ||
    Array.from(opPaths).some((p) => p.endsWith('/package.json')) ||
    Array.from(existingFilePaths).some((p) => p.endsWith('/package.json'));

  const hasNextApp =
    Array.from(opPaths).some((p) => p.startsWith('app/') || p.includes('/app/')) ||
    Array.from(existingFilePaths).some((p) => p.startsWith('app/') || p.includes('/app/'));

  // Auto-scaffold package.json if creating or editing Next.js project and missing
  if (!hasPackage && hasNextApp) {
    rawOps.unshift({
      type: 'create',
      path: 'package.json',
      content: JSON.stringify(
        {
          name: 'codatron-app',
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: '14.2.24',
            react: '^18.3.1',
            'react-dom': '^18.3.1',
            '@next/swc-wasm-nodejs': '14.2.24',
            'lucide-react': '^0.460.0',
          },
          devDependencies: {
            typescript: '^5.4.5',
            '@types/node': '^20.12.7',
            '@types/react': '^18.3.1',
            '@types/react-dom': '^18.3.0',
            tailwindcss: '^3.4.1',
            postcss: '^8.4.38',
            autoprefixer: '^10.4.19',
          },
        },
        null,
        2
      ),
    });
    opPaths.add('package.json');
  }

  const hasLayout =
    Array.from(opPaths).some((p) => /(^|\/)layout\.(tsx|jsx|ts|js)$/.test(p)) ||
    Array.from(existingFilePaths).some((p) => /(^|\/)layout\.(tsx|jsx|ts|js)$/.test(p));

  // Auto-scaffold app/layout.tsx if missing in Next.js app
  if (!hasLayout && hasNextApp) {
    rawOps.push({
      type: 'create',
      path: 'app/layout.tsx',
      content: `import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Codatron Application',
  description: 'Built with Codatron AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="bg-[#0b0c16] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
`,
    });
    opPaths.add('app/layout.tsx');
  }

  // Assert scaffold validity taking existing files into account
  assertCompleteProjectScaffold(Array.from(opPaths), existingFiles);

  const known = new Set(existingFiles.filter((file) => !file.is_folder).map((file) => file.path));
  const opsByPath = new Map<string, FileOperation>();

  for (const operation of rawOps) {
    if (
      !operation ||
      typeof operation !== 'object' ||
      !['create', 'update', 'delete', 'rename'].includes((operation as FileOperation).type)
    ) {
      continue;
    }
    const typed = { ...(operation as FileOperation) };
    let path = cleanPath(typed.path);

    if (commonPrefix && path.startsWith(commonPrefix)) {
      path = path.slice(commonPrefix.length);
    }
    path = cleanPath(path);
    if (!path) continue;

    assertSafePath(path);
    typed.path = path;

    if (typed.type === 'create' || typed.type === 'update') {
      if (typeof typed.content !== 'string') {
        typed.content = '';
      }
      typed.content = sanitizeGeneratedContent(typed.path, typed.content);
      if (typed.path === 'package.json' || typed.path.endsWith('/package.json')) {
        assertValidPackageJson(typed.path, typed.content);
      }
      if (typed.content.length > 250_000) {
        throw new Error(`Invalid content length for ${typed.path}.`);
      }
      // Heuristic duplicate prevention: detect duplicate suffix patterns like Foo2.tsx, FooNew.tsx, Foo_updated.tsx
      if (typed.type === 'create' && !known.has(typed.path)) {
        const baseMatch = typed.path.match(/^(.*?)[\-_]?(?:2|new|updated|v2|copy)\.(tsx?|jsx?|css|json)$/i);
        if (baseMatch) {
          const basePath = `${baseMatch[1]}.${baseMatch[2]}`;
          if (known.has(basePath)) {
            // Retarget to update the original file instead of creating duplicate
            typed.path = basePath;
            typed.type = 'update';
          }
        }
      }

      // Smart healing: adjust create <-> update based on existing files in project
      if (typed.type === 'create' && known.has(typed.path)) {
        typed.type = 'update';
      } else if (typed.type === 'update' && !known.has(typed.path)) {
        typed.type = 'create';
      }
      opsByPath.set(typed.path, typed);
    } else if (typed.type === 'delete') {
      if (known.has(typed.path)) {
        opsByPath.set(typed.path, typed);
      }
    } else if (typed.type === 'rename') {
      const rename = typed as Extract<FileOperation, { type: 'rename' }>;
      if (typeof rename.newPath !== 'string') continue;
      let newPath = cleanPath(rename.newPath);
      if (commonPrefix && newPath.startsWith(commonPrefix)) {
        newPath = newPath.slice(commonPrefix.length);
      }
      newPath = cleanPath(newPath);
      if (!newPath) continue;
      assertSafePath(newPath);
      rename.newPath = newPath;
      if (known.has(rename.path)) {
        opsByPath.set(rename.path, rename);
      }
    }
  }

  const rawOperations = Array.from(opsByPath.values());
  if (rawOperations.length === 0) {
    throw new Error('No valid file operations could be extracted.');
  }

  const rawDependencies = (result.dependencies ?? [])
    .filter((dep) => Boolean(dep && typeof dep.name === 'string' && NPM_PACKAGE_NAME_REGEX.test(dep.name.trim())))
    .map((dependency) => {
      const version =
        dependency.version && /^[-~^<>=*\w.]+$/.test(dependency.version) ? dependency.version : 'latest';
      return { name: dependency.name.trim(), version };
    });

  // Extract or synthesize progressive execution plan
  const plan: string[] = Array.isArray(result.plan) && result.plan.length > 0
    ? result.plan.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [
      'Analyzed project requirements',
      ...rawOperations.map(
        (op) =>
          `${op.type === 'create' ? 'Create' : op.type === 'update' ? 'Update' : op.type === 'delete' ? 'Remove' : 'Rename'} ${op.path}`
      ),
      'Configure dependencies & verify live preview',
    ];

  // Perform automatic dependency & unused file cleanup pass
  const cleaned = auditAndCleanupProject(rawOperations, existingFiles, rawDependencies);

  return {
    summary,
    operations: cleaned.operations,
    dependencies: cleaned.dependencies,
    plan,
    cleanupReport: cleaned.cleanupReport,
  };
}

const PATH_PATTERN = /^[a-zA-Z0-9_\-./@]+$/;
const BLOCKED_SEGMENTS = new Set(['..', '.', 'node_modules', '.git', '.env', '.env.local']);

function assertSafePath(path: string) {
  const parts = path.split('/');
  if (!PATH_PATTERN.test(path) || path.startsWith('/') || parts.some((part) => BLOCKED_SEGMENTS.has(part))) {
    throw new Error(`Unsafe project path: ${path}`);
  }
}

export function selectProjectContext(
  files: ProjectFile[],
  activePath?: string,
  selectedCode?: string,
  previewError?: string,
  mode?: 'build' | 'code' | 'debug',
  referenceImage?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  const sourceFiles = files.filter((file) => !file.is_folder);
  const active = sourceFiles.find((file) => file.path === activePath);

  // In debug mode, prioritize files mentioned in previewError / stack trace
  const errorLower = (previewError || '').toLowerCase();
  const errorMentioned = previewError
    ? sourceFiles.filter((f) => errorLower.includes(f.path.toLowerCase()) || errorLower.includes(f.name.toLowerCase()))
    : [];

  const priority = sourceFiles
    .filter((file) => file.path !== activePath && !errorMentioned.some((em) => em.path === file.path))
    .sort((a, b) => relevance(b.path) - relevance(a.path))
    .slice(0, 10);

  const included = [
    ...errorMentioned,
    ...(active && !errorMentioned.some((em) => em.path === active.path) ? [active] : []),
    ...priority,
  ]
    .slice(0, 12)
    .map((file) => ({ path: file.path, content: file.content.slice(0, 18_000) }));

  return {
    mode: mode || 'code',
    tree: sourceFiles.map((file) => file.path),
    files: included,
    activePath,
    selectedCode: selectedCode?.slice(0, 12_000),
    previewError: previewError?.slice(0, 8_000),
    referenceImage,
    conversationHistory: conversationHistory?.slice(-6),
  };
}

function relevance(path: string) {
  return (
    Number(path === 'package.json') * 12 +
    Number(path === 'app/page.tsx' || path === 'src/App.tsx') * 10 +
    Number(path.startsWith('components/')) * 5 +
    Number(path.startsWith('app/')) * 3
  );
}


export interface CodingAgentOptions {
  aiConfig?: { apiKey: string; model?: string; providerId?: string; keySource?: string };
  onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
  onFallback?: (fallbackInfo: { providerId: string; model: string }) => void;
}

export type GeminiAgentOptions = CodingAgentOptions;

export function buildFullCodingAgentSystemPrompt(context: ReturnType<typeof selectProjectContext>): string {
  return `You are the Coding Agent for Codatron.ai, a professional AI Product Development IDE.

You work INSIDE an existing software project.

Your job is NOT to create a separate project unless the user explicitly asks for a new project.

You must understand the existing project structure before making changes.

Current Operating Mode: ${context.mode.toUpperCase()}

==================================================
CORE RULES
==================================================

1. EXISTING PROJECT FIRST
- Treat the provided project tree and file contents as the current source codebase.
- Preserve existing working architecture.
- Reuse existing components, utilities, APIs, database logic, styles, and configuration whenever possible.
- Do not replace working infrastructure unnecessarily.
- Do not create duplicate versions of existing functionality.
- Do not create a second application, editor, database, or API system.
- Do not invent files that already exist.
- Do not silently migrate the project to another framework.

2. PROJECT-AWARE GENERATION
- Inspect package.json and the provided project tree before generating architecture.
- Identify the actual framework, language, package manager, routing structure, and existing conventions.
- Respect the existing Next.js App Router structure when present.
- Respect existing React/Vite, CRA, or other app conventions already in the project.
- Respect existing TypeScript configuration.
- Respect existing Tailwind/shadcn/component conventions.
- Reuse existing dependencies when they already provide the required functionality.
- Do not assume Next.js when the user asked for React or when the project already uses Vite/React.
- For a React project, generate a valid React app structure using Vite conventions when appropriate: package.json, vite.config.*, index.html, src/main.jsx/tsx, src/App.jsx/tsx, src/index.css.
- For a Next.js project, generate the proper Next.js file structure: package.json, app/layout.tsx, app/page.tsx, app/globals.css, next.config.* when needed.
- For a static HTML/CSS page, generate only the required static files and not a framework app unless the user asked for one.

3. SOURCE OF TRUTH
- The project files supplied in the context represent the current project state.
- Generated operations will later be persisted to Supabase project_files.
- Never assume that a file exists unless it appears in the project tree/context.
- Never depend on files that you did not create or that are not already present.

==================================================
1. BUILD MODE
==================================================

When mode = BUILD:

The goal is to create a COMPLETE, runnable implementation of the user's requested product or feature.

BUILD MODE must:

1. Understand the requested product.
2. Inspect the existing project structure.
3. Determine the appropriate architecture.
4. Determine which existing files should be reused.
5. Determine which files must be created.
6. Determine which files must be updated.
7. Determine whether dependencies are actually required.
8. Generate the required implementation as complete files.

For a new Next.js App Router application, when those files do not already exist, consider the required project foundation:

- package.json
- tsconfig.json
- next.config.*
- app/layout.tsx
- app/page.tsx
- app/globals.css
- required components
- required utilities/lib files
- public assets when needed

For a React/Vite application, use the correct Vite structure when appropriate:

- package.json
- vite.config.*
- index.html
- src/main.jsx or src/main.tsx
- src/App.jsx or src/App.tsx
- src/index.css or src/styles.css
- required components

If the user explicitly asks for a React app, do not produce a Next.js-only structure unless the project is already Next.js.
If the user explicitly asks for a Next.js app, do not produce a Vite-only structure unless the project is already Vite.
Do not generate a partial file set like package.json + config alone without the actual app entry file.

IMPORTANT:

Do NOT blindly generate the entire project if a functioning project already exists.

If the project already contains:

- package.json
- app/
- components/
- lib/
- configuration
- database utilities
- authentication
- existing UI

then MODIFY and EXTEND the existing architecture instead of replacing it.

Every generated file must contain complete implementation code.

Do NOT generate:

- "// TODO"
- "// implement later"
- empty placeholder components
- fake APIs
- fake database implementations
- fake runtime output
- Hello World/demo pages unless explicitly requested.

Build the actual requested product.

CRITICAL: RESPONSE SIZE & TOKEN EFFICIENCY:
- Prioritize creating the core, high-impact files first:
  1. package.json and configuration
  2. app/layout.tsx and app/page.tsx (or main entry point)
  3. Essential interactive components and data files
- Keep demo/mock data arrays concise (e.g. 6 to 8 realistic items, NOT dozens of items).
- Avoid bloated inline SVGs or massive mock databases. Use Lucide icons and sleek CSS/Tailwind classes.
- Ensure the total output stays cleanly within token limits so that every file is generated completely without truncation.

==================================================
2. CODE MODE
==================================================

When mode = CODE:

The user wants a specific implementation, feature, refactor, UI change, bug-free enhancement, or code modification.

Rules:

- Preserve existing functionality.
- Modify only files required for the request.
- Reuse existing components and utilities.
- Do not regenerate unrelated files.
- Do not replace the entire application.
- Do not change framework or architecture unless explicitly required.
- Follow existing project conventions.
- Keep imports valid.
- Keep TypeScript types correct.
- Maintain compatibility with existing APIs and database logic.

If the requested feature requires a new dependency:

- add it only when necessary
- return it in the dependencies array
- do not add duplicate packages already present in package.json.

==================================================
3. DEBUG MODE
==================================================

When mode = DEBUG:

The goal is to repair an existing runtime/build/type/import problem.

Analyze:

- runtime error
- stack trace
- preview error
- affected file
- relevant project files
- package.json when dependency/configuration is involved.

Rules:

- Find the smallest correct fix.
- Modify only affected/relevant files.
- Preserve unrelated functionality.
- Do NOT regenerate the whole application.
- Do NOT replace working architecture.
- Do NOT randomly change dependencies.
- Do NOT hide the error with fallback UI.
- Do NOT remove functionality merely to make the error disappear.

If the error is caused by:

Missing import:
→ fix the import or create the genuinely missing module.

Missing dependency:
→ add the required dependency.

Incorrect dependency version:
→ update only when justified.

TypeScript error:
→ fix the underlying type issue.

Runtime error:
→ fix the actual runtime cause.

Framework/configuration error:
→ modify the relevant configuration file.

Preview/dev-server error:
→ investigate the actual error rather than creating fake preview content.

Return targeted UPDATE/CREATE operations.

==================================================
4. FILE OPERATIONS & 4-STEP DECISION PIPELINE
==================================================

Allowed operations: CREATE, UPDATE, DELETE, RENAME

CRITICAL 4-STEP DECISION WORKFLOW:
Before generating any file operation:

STEP 1: INSPECT THE CURRENT PROJECT TREE
Examine all existing paths in the provided project tree (e.g. app/, components/, lib/).

STEP 2: UNDERSTAND EXISTING ARCHITECTURE & CONVENTIONS
- Framework & Router: Next.js App Router (app/ directory, page.tsx, layout.tsx) vs Pages Router vs Vite
- Directory structure: components/, components/ui/, app/, lib/
- Naming conventions: PascalCase for components (e.g. Pricing.tsx) or kebab-case (e.g. pricing-section.tsx), or route-based (e.g. app/pricing/page.tsx)
- Existing relevant components: inspect what is already imported or rendered in app/page.tsx

STEP 3: DETERMINE IF THE REQUESTED FUNCTIONALITY ALREADY EXISTS
Check if a file in the project tree already represents the target feature or page:
- E.g. if user asks "Build a pricing page", check if components/Pricing.tsx or app/pricing/page.tsx already exists!
- E.g. if user asks "Make the pricing cards more premium", inspect the existing pricing file!

STEP 4: CHOOSE OPERATION & PATH
- If a relevant file EXISTS:
  You MUST choose UPDATE on that existing file.
  NEVER create duplicate files such as Pricing2.tsx, PricingNew.tsx, PricingUpdated.tsx, or Navbar2.tsx.
- If a relevant file DOES NOT EXIST:
  Choose CREATE with a meaningful, appropriate path based on the project's existing structure and conventions.
  Examples:
    - components/Pricing.tsx or components/pricing/pricing-section.tsx or app/pricing/page.tsx
    - components/resume/resume-form.tsx or components/resume/resume-preview.tsx
  Do NOT hardcode the same filename for every project. Decide dynamically based on the project structure.
  STRICTLY FORBIDDEN:
  - Never name files generic placeholders like components/new-file.tsx, component1.tsx, or temp.tsx.

1. AUTOMATIC MEANINGFUL FILE NAMING:
   When creating new files, always choose appropriate, clean, conventional, and meaningful names based on:
   - feature / component responsibility
   - folder structure conventions (e.g., components/, app/, lib/)
   - framework conventions (e.g., PascalCase for React components like Pricing.tsx or kebab-case)

2. PREFER UPDATE OVER CREATE (NO DUPLICATES):
   Before creating a file, inspect the existing project tree.
   If a file representing that feature already exists, UPDATE it! Do NOT duplicate it!

3. DELETE:
   Use sparingly and only when a file is genuinely obsolete or explicitly requested.

4. RENAME:
   Use only when a file must legitimately change location or naming.

==================================================
5. DEPENDENCY RULES
==================================================

Before adding a dependency:

1. Check the project context/package.json.
2. Determine whether the functionality already exists.
3. Reuse existing dependencies when possible.

Only return dependencies that are genuinely required.

Do not add:

- duplicate packages
- unnecessary UI libraries
- random utility libraries
- packages that duplicate existing functionality.

For a dependency change, the runtime system will determine whether installation is required.

==================================================
6. NEXT.JS RULES
==================================================

When working with Next.js:

- Respect App Router conventions.
- Use server components by default.
- Add "use client" only when browser APIs, hooks, state, or event handlers require it.
- Do not use browser-only APIs inside server components.
- Keep server/client boundaries correct.
- Use existing routing/layout structure.
- Preserve existing authentication and database architecture.
- Do not replace Next.js with Vite/CRA.
- Do not create Create React App files in a Next.js project.
- In package.json for Next.js, use Next.js 14.2.24 and React 18, and include "@next/swc-wasm-nodejs": "14.2.24" in dependencies for WebContainer WebAssembly runtime compatibility.

==================================================
7. UI & REAL VISUAL ASSET RULES
==================================================

When generating UI:

- Build the requested product, not a generic dashboard template.
- Make the UI responsive with clean mobile navigation and flexible layouts.
- Reuse existing design tokens/components.
- Respect existing shadcn/Tailwind conventions.
- Use semantic HTML.
- Include useful loading, empty, error, and success states where appropriate.
- Keep components modular.
- Avoid excessive monolithic files.
- Do not generate fake interactions that appear functional but do nothing.

CRITICAL: REAL VISUAL ASSETS & IMAGERY STRATEGY:
Generated UI should NEVER automatically rely on:
- empty gradient backgrounds where visual imagery is expected
- plain color blocks or gray rectangles
- generic placeholder boxes like "Image goes here" or "[Poster Placeholder]"
- broken image URLs or missing assets

When the requested interface requires visual assets (streaming/Netflix, travel, e-commerce, portfolio, landing pages, galleries):
1. USE REAL, THEMATIC UNSPLASH IMAGES:
   Provide high-resolution, thematic, curated stock photography from Unsplash.
   Examples:
   - Streaming/Cinema:
     * Sci-Fi: https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80
     * Space: https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80
     * Thriller: https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80
     * Drama: https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&auto=format&fit=crop&q=80
     * Nature/Doc: https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80
     * Animation: https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80
   - E-Commerce / Products:
     * Tech / Audio: https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80
     * Watches: https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80
     * Shoes / Apparel: https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80
   - Travel / Hospitality:
     * Tropical: https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80
     * Architecture: https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&auto=format&fit=crop&q=80
2. ASSET ROBUSTNESS & RESPONSIVENESS:
   - Always use proper aspect ratio classes (e.g. aspect-[2/3] for movie posters, aspect-video for hero banners, aspect-square for products).
   - Use w-full h-full object-cover to prevent layout overflow.
   - For demo applications, use original cinematic titles with compelling descriptions (e.g. "Chronicles of Nebula", "Midnight Echoes", "The Quantum Horizon").
   - Include graceful fallback handling in img elements (e.g. onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&auto=format&fit=crop&q=80'; }}).
${context.referenceImage ? `
==================================================
REFERENCE IMAGE CONTEXT
==================================================
The user has attached a visual reference image / screenshot to their prompt.
Visually align the generated application with this reference:
- Mirror the visual hierarchy, header/navigation design, card grid arrangements, color palette, and spacing.
- Maintain the visual tone and layout structure presented in the reference.
` : ''}
${context.conversationHistory && context.conversationHistory.length > 0 ? `
==================================================
CONVERSATION THREAD & ITERATIVE CONTEXT
==================================================
This request is part of an ongoing conversation between the user and Codatron AI.
Recent dialogue turns:
${context.conversationHistory.map((m) => `${m.role === 'user' ? 'User' : 'Codatron'}: "${m.content.slice(0, 300)}"`).join('\n')}

CRITICAL FOR ITERATIVE PROMPTS:
- The current user request modifies or extends the work from previous prompts (e.g., "Make the hero taller", "Add more movie posters", "Add search", "Use a purple accent").
- Understand what has already been built from the history and existing project files.
- NEVER wipe out or regenerate working components unless explicitly asked.
- Make targeted, surgical updates to the specific components or files involved.
- In your "summary", provide a natural, conversational response that directly addresses the user's request (e.g., "Done — I expanded the hero section and added more movie posters. Your preview has been updated." or concise bullet points of what was added).
` : ''}
If the project already has an established visual system:

PRESERVE IT.

Do not redesign the entire application for a small UI request.

==================================================
8. DATABASE / SUPABASE RULES
==================================================

If Supabase/database code already exists:

- reuse the existing database architecture.
- inspect existing tables/utilities supplied in context.
- do not create duplicate persistence systems.
- do not replace Supabase with another database.
- do not invent database tables unless the requested feature genuinely requires them.
- do not expose service-role secrets to client components.

==================================================
9. RUNTIME-AWARE RULES
==================================================

Codatron uses WebContainer as the primary browser runtime for Node.js/JS/TS projects.

Generated projects must therefore be runnable using their actual project configuration.

Respect:

- package.json
- scripts
- lockfiles
- packageManager
- framework configuration.

For development scripts:

Prefer the project's existing:

scripts.dev

Do not hardcode:

npm run dev

inside generated source code.

Do not generate fake localhost URLs.

Do not generate fake terminal output.

Do not create fake preview implementations.

The runtime manager is responsible for:

- mounting files
- dependency installation
- starting the dev server
- detecting server-ready
- providing the preview URL.

The Coding Agent is responsible for generating a valid project that the runtime can execute.

==================================================
10. IMPORT AND FILE CONSISTENCY
==================================================

Before returning operations, verify mentally that:

- every generated import points to a real file
- every imported symbol exists
- relative paths are correct
- aliases match tsconfig
- client components use "use client" when required
- generated routes match the framework
- configuration files reference valid packages
- package dependencies match imports.

Do not reference files that are not created or present in the supplied project context.

==================================================
11. COMPLETENESS RULE
==================================================

For BUILD mode:

Never intentionally return a partial application when the user requested a complete application.

For CODE mode:

Return only the files necessary for the requested change.

For DEBUG mode:

Return only targeted repairs.

Completeness depends on the mode.

==================================================
12. SECURITY RULES
==================================================

Never generate or expose:

- API secrets
- private keys
- service-role credentials
- passwords
- tokens
- .env contents.

Do not create:

.env
.env.local

with secret values.

Use environment-variable references instead.

Never bypass existing authentication or authorization merely to make functionality work.

==================================================
13. RESPONSE FORMAT
==================================================

Return ONLY valid JSON matching the required schema.

No Markdown.
No explanations outside JSON.
No code fences.

Schema:

{
  "plan": [
    "Analyze project architecture and requirements",
    "Create or update target component files",
    "Configure styling and interactive features",
    "Verify application preview"
  ],
  "summary": "Concise description of the implementation",
  "operations": [
    {
      "type": "create" | "update" | "delete" | "rename",
      "path": "relative/path/to/file.ext",
      "content": "Complete file content for create/update",
      "newPath": "destination path for rename",
      "language": "typescript | javascript | python | java | cpp | css | json | markdown | html | plaintext"
    }
  ],
  "dependencies": [
    {
      "name": "package-name",
      "version": "version-specifier"
    }
  ],
  "assets": [
    {
      "id": "asset-id",
      "type": "image",
      "description": "visual asset description"
    }
  ]
}

==================================================
14. VISUAL AESTHETICS & ASSETS
==================================================
- When generating visual web applications (e.g. Netflix clone, streaming service, SaaS dashboard):
  * Use sleek dark themes, high-contrast typography, and smooth CSS gradients.
  * Use Lucide React icons for controls, playback, search, and badges.
  * For streaming/poster cards, design elegant CSS poster cards with gradient backdrops and category badges.
  * Do NOT use broken or random external image URLs (e.g. https://random-site/image.jpg).
  * If assets are needed, declare them in the optional "assets" manifest array in your response.

For create/update:

"content" must contain the COMPLETE file.

Never truncate generated files.

Never return placeholder content.

==================================================
FINAL QUALITY CHECK
==================================================

Before returning the JSON:

1. Confirm operations are valid.
2. Confirm paths are safe.
3. Confirm imports are consistent.
4. Confirm dependencies are necessary.
5. Confirm the requested functionality is actually implemented.
6. Confirm existing functionality is preserved.
7. Confirm the operation set is minimal for CODE/DEBUG mode.
8. Confirm BUILD mode produces a complete runnable implementation.
9. Confirm no fake runtime/preview behavior was introduced.
10. Confirm no secrets were generated.

Return the final structured file operations only.`;
}

export async function runHuggingFaceAgent(
  prompt: string,
  context: ReturnType<typeof selectProjectContext>,
  options?: CodingAgentOptions
): Promise<unknown> {
  const token = options?.aiConfig?.apiKey?.trim() || process.env.HF_TOKEN?.trim();
  if (!token) {
    throw new HuggingFaceAuthError(
      'Hugging Face is not configured. Add HF_TOKEN to .env or add your personal API key in Profile.'
    );
  }

  const model = options?.aiConfig?.model?.trim() || process.env.HF_MODEL?.trim() || DEFAULT_HF_MODEL;
  const system = buildFullCodingAgentSystemPrompt(context);

  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        instruction: prompt,
        project: context,
      }),
    },
  ];

  const hf = new HfInference(token);
  const maxAttempts = MAX_HF_RETRIES + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    console.log(`[Hugging Face API] Model: ${model}, Attempt: ${attempt + 1}/${maxAttempts}`);
    try {
      const response = await hf.chatCompletion({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 4096,
      });

      const choice = response.choices?.[0];
      if (!choice || !choice.message?.content) {
        throw new Error('Hugging Face returned an empty response.');
      }

      if (options?.onUsage && response.usage) {
        options.onUsage({
          inputTokens: response.usage.prompt_tokens ?? 0,
          outputTokens: response.usage.completion_tokens ?? 0,
          totalTokens:
            response.usage.total_tokens ??
            ((response.usage.prompt_tokens ?? 0) + (response.usage.completion_tokens ?? 0)),
        });
      }

      const rawText = choice.message.content.trim();
      let cleanedJson = rawText;
      if (cleanedJson.startsWith('```')) {
        const fenceMatch = cleanedJson.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
        cleanedJson = fenceMatch
          ? fenceMatch[1].trim()
          : cleanedJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanedJson);
      } catch (parseErr) {
        console.warn(`[Hugging Face JSON Parse Error] Failed to parse response from ${model}:`, parseErr);
        const salvaged = salvageTruncatedOperations(rawText);
        if (salvaged && salvaged.operations && salvaged.operations.length > 0) {
          console.log(`[Hugging Face JSON Salvaged] Successfully salvaged ${salvaged.operations.length} completed files!`);
          return salvaged;
        }
        throw new MalformedAIResponseError(
          'AI returned an invalid project response. Retrying with a safer generation format.'
        );
      }

      return parsed;
    } catch (err: unknown) {
      if (err instanceof MalformedAIResponseError) {
        throw err;
      }
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const status = (err as { httpResponse?: { status?: number } })?.httpResponse?.status;

      if (
        status === 401 ||
        status === 403 ||
        errMsg.toLowerCase().includes('invalid username or password') ||
        errMsg.toLowerCase().includes('unauthorized') ||
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('sufficient permissions') ||
        errMsg.toLowerCase().includes('forbidden')
      ) {
        throw new HuggingFaceAuthError(
          `Hugging Face API authentication/permission failed (${status || 403}): ${errMsg || 'Check HF_TOKEN permissions.'}`
        );
      }

      if (
        status === 402 ||
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('balance') ||
        errMsg.toLowerCase().includes('insufficient') ||
        errMsg.toLowerCase().includes('depleted your monthly included credits')
      ) {
        throw new HuggingFaceQuotaError(
          'Hugging Face API credits or balance is insufficient. Please check billing or token settings.'
        );
      }

      if (status === 429) {
        if (attempt < maxAttempts - 1) {
          const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          console.log(`[Hugging Face API] Rate limit reached. Retrying in ${delay}ms`);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new HuggingFaceRateLimitError(
          'Hugging Face API rate limit reached. Please retry shortly.'
        );
      }

      const isServerError =
        [500, 502, 503, 504].includes(status ?? 0) ||
        errMsg.toLowerCase().includes('unavailable') ||
        errMsg.toLowerCase().includes('fetch failed') ||
        errMsg.toLowerCase().includes('network') ||
        errMsg.toLowerCase().includes('requesting the provider');

      if (isServerError) {
        if (attempt < maxAttempts - 1) {
          const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          console.log(`[Hugging Face API] Server/Provider error (${status || 'network'}). Retrying in ${delay}ms`);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new HuggingFaceUnavailableError(
          'Hugging Face Inference Provider is temporarily unavailable. Please retry.'
        );
      }

      if (attempt === maxAttempts - 1) break;
      const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new HuggingFaceUnavailableError(
    'Hugging Face Inference Provider is temporarily unavailable. Please retry.'
  );
}

export function salvageTruncatedOperations(rawText: string): AgentResult | null {
  try {
    let summary = 'Project files generated successfully.';
    const summaryMatch = rawText.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (summaryMatch) {
      summary = summaryMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

    const opsIndex = rawText.indexOf('"operations"');
    if (opsIndex === -1) return null;
    const arrayStart = rawText.indexOf('[', opsIndex);
    if (arrayStart === -1) return null;

    const operations: Array<Record<string, unknown>> = [];
    let i = arrayStart + 1;
    const len = rawText.length;

    while (i < len) {
      while (i < len && rawText[i] !== '{' && rawText[i] !== ']') {
        i++;
      }
      if (i >= len || rawText[i] === ']') break;

      const objStart = i;
      let depth = 0;
      let inString = false;
      let escape = false;
      let foundEnd = false;

      while (i < len) {
        const char = rawText[i];
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = !inString;
        } else if (!inString) {
          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              foundEnd = true;
              i++;
              break;
            }
          }
        }
        i++;
      }

      if (foundEnd) {
        const objStr = rawText.slice(objStart, i);
        try {
          const parsedObj = JSON.parse(objStr) as Record<string, unknown>;
          if (
            parsedObj &&
            typeof parsedObj.type === 'string' &&
            typeof parsedObj.path === 'string' &&
            typeof parsedObj.content === 'string'
          ) {
            operations.push(parsedObj);
          }
        } catch {
          break;
        }
      } else {
        break;
      }
    }

    if (operations.length === 0) return null;

    const depsMatch = rawText.match(/"dependencies"\s*:\s*\[([\s\S]*?)\]/);
    let dependencies: Array<{ name: string; version: string }> = [];
    if (depsMatch) {
      try {
        dependencies = JSON.parse(`[${depsMatch[1]}]`) as Array<{ name: string; version: string }>;
      } catch { }
    }

    return {
      summary: `${summary} (Salvaged complete files from generation)`,
      operations: operations as unknown as AgentResult['operations'],
      dependencies,
    };
  } catch (err) {
    console.error('Failed to salvage truncated operations:', err);
    return null;
  }
}

export async function runGeminiAgent(
  prompt: string,
  context: ReturnType<typeof selectProjectContext>,
  options?: GeminiAgentOptions
): Promise<unknown> {
  const key = options?.aiConfig?.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Gemini is not configured. Add GEMINI_API_KEY to .env.local or add your personal API key in Profile.');
  const rawModel = options?.aiConfig?.model?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const model = rawModel === 'gemini-3.6-flash' ? 'gemini-2.5-flash' : rawModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const maxAttempts = 4;
  const system = buildFullCodingAgentSystemPrompt(context);

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: 1.0,
    maxOutputTokens: 65536,
    responseSchema: {
      type: 'OBJECT',
      properties: {
        summary: {
          type: 'STRING',
          description: 'Concise description of the implementation',
        },
        operations: {
          type: 'ARRAY',
          description: 'List of file operations to apply',
          items: {
            type: 'OBJECT',
            properties: {
              type: {
                type: 'STRING',
                enum: ['create', 'update', 'delete', 'rename'],
              },
              path: {
                type: 'STRING',
                description: 'Relative file path',
              },
              content: {
                type: 'STRING',
                description: 'Complete file content for create/update',
              },
              newPath: {
                type: 'STRING',
                description: 'Destination file path for rename',
              },
              language: {
                type: 'STRING',
                description: 'File language identifier',
              },
            },
            required: ['type', 'path'],
          },
        },
        dependencies: {
          type: 'ARRAY',
          description: 'Required dependencies',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              version: { type: 'STRING' },
            },
            required: ['name'],
          },
        },
      },
      required: ['summary', 'operations'],
    },
  };

  let response: Response | undefined;
  let failureText = '';
  let currentTemperature = 1.0;
  let payload: any = null;
  let candidate: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    console.log(`[Gemini API] Model: ${model}, Attempt: ${attempt + 1}/${maxAttempts}, Temp: ${currentTemperature}`);

    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify({ instruction: prompt, project: context }) }],
        },
      ],
      generationConfig: {
        ...generationConfig,
        temperature: currentTemperature,
      },
    });

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: requestBody,
      });

      if (!response.ok) {
        failureText = (await response.text()).slice(0, 800);
        console.warn(`[Gemini API] Status: ${response.status}`);

        // Differentiate exhausted quota from temporary rate limiting
        const isQuotaExceeded =
          response.status === 429 &&
          (failureText.toLowerCase().includes('quota') ||
            failureText.toLowerCase().includes('billing') ||
            failureText.toLowerCase().includes('exceeded your current quota'));

        if (isQuotaExceeded) {
          console.error('[Gemini API] Quota exhausted (429):', failureText.slice(0, 300));
          throw new GeminiQuotaError(
            'Gemini API quota has been exceeded for the configured API key/project. Check Gemini API usage and billing/quota settings.'
          );
        }

        const isRetryable = [429, 500, 502, 503, 504].includes(response.status);
        if (!isRetryable || attempt === maxAttempts - 1) {
          break;
        }

        const retryAfterHeader = Number(response.headers.get('retry-after'));
        const baseDelay = 1000 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * (200 + attempt * 200));
        const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : baseDelay + jitter;

        console.log(`[Gemini API] Retrying in ${delay}ms`);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        continue;
      }

      payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: {
          candidatesTokenCount?: number;
          promptTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      candidate = payload?.candidates?.[0];

      if (candidate?.finishReason === 'RECITATION' && attempt < maxAttempts - 1) {
        console.warn(`[Gemini API] Output flagged as RECITATION at attempt ${attempt + 1}. Retrying with high entropy temperature (1.1)...`);
        currentTemperature = 1.1;
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
        continue;
      }

      if (candidate) {
        break;
      }
    } catch (err) {
      if (err instanceof GeminiQuotaError) throw err;
      failureText = err instanceof Error ? err.message : 'Network failure';
      if (attempt === maxAttempts - 1) break;
      const baseDelay = 1000 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 300);
      const delay = baseDelay + jitter;
      console.warn(`[Gemini API] Network error: ${failureText}. Retrying in ${delay}ms`);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  if (!response?.ok && !candidate) {
    if (response && [500, 502, 503, 504].includes(response.status)) {
      throw new GeminiUnavailableError(
        'Gemini is temporarily unavailable. The model is experiencing high demand. Retried automatically; please try again shortly.'
      );
    }
    if (response?.status === 429) {
      throw new GeminiQuotaError(
        'Gemini API quota has been exceeded for the configured API key/project. Check Gemini API usage and billing/quota settings.'
      );
    }
    throw new Error(`Gemini request failed (${response?.status ?? 'network'}): ${failureText}`);
  }

  if (!candidate) {
    throw new Error('Gemini returned no candidates in response.');
  }

  // Extract usage metadata if returned by Gemini
  if (options?.onUsage && payload.usageMetadata) {
    const inputTokens = payload.usageMetadata.promptTokenCount ?? 0;
    const outputTokens = payload.usageMetadata.candidatesTokenCount ?? 0;
    const totalTokens = payload.usageMetadata.totalTokenCount ?? (inputTokens + outputTokens);
    options.onUsage({ inputTokens, outputTokens, totalTokens });
  }

  const finishReason = candidate.finishReason;
  const parts: Array<{ text?: string; thought?: boolean }> = candidate.content?.parts ?? [];
  const textParts = parts.filter((p) => !p.thought && typeof p.text === 'string' && p.text.trim().length > 0);
  const rawText = (textParts.length > 0 ? textParts : parts)
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!rawText) {
    console.error('[Gemini API] Empty text in response candidate:', JSON.stringify(candidate));
    throw new Error(`Gemini returned an empty response (finishReason: ${finishReason || 'unknown'}).`);
  }

  console.log(`[Gemini API] Request succeeded with model: ${model}`);
  console.log(`[Gemini JSON] Response length: ${rawText.length}, Finish reason: ${finishReason || 'UNKNOWN'}`);

  // Detect truncated JSON
  if (finishReason === 'MAX_TOKENS') {
    console.warn(`[Gemini JSON Warning] Truncated output detected (finishReason: MAX_TOKENS). Length: ${rawText.length}. Attempting to salvage completed file operations...`);
    const salvaged = salvageTruncatedOperations(rawText);
    if (salvaged && salvaged.operations && salvaged.operations.length > 0) {
      console.log(`[Gemini JSON Salvaged] Successfully salvaged ${salvaged.operations.length} completed files!`);
      return salvaged;
    }
    throw new Error(
      'Gemini returned an incomplete structured response (token limit reached). No files were saved. Please retry the generation or split the build into smaller batches.'
    );
  }

  // Safe transport normalization: strip surrounding markdown code fences or whitespace without altering inner content
  let cleanedJson = rawText;
  if (cleanedJson.startsWith('```')) {
    const fenceMatch = cleanedJson.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
    if (fenceMatch) {
      cleanedJson = fenceMatch[1].trim();
    } else {
      cleanedJson = cleanedJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedJson);
    console.log('[Gemini JSON] Parsed successfully');
  } catch (parseErr) {
    console.error(`[Gemini JSON Parse Error] Failed to parse response from ${model}:`, parseErr instanceof Error ? parseErr.message : parseErr);
    console.error(`[Gemini JSON Parse Error] Response length: ${rawText.length}, Finish reason: ${finishReason || 'UNKNOWN'}`);
    console.error(`[Gemini JSON Parse Error] First 200 chars: ${rawText.slice(0, 200)}`);
    console.error(`[Gemini JSON Parse Error] Last 200 chars: ${rawText.slice(-200)}`);
    throw new Error('Gemini returned an incomplete structured response. No files were saved. Please retry the generation.');
  }

  return parsed;
}

export async function runCodingAgent(
  prompt: string,
  context: ReturnType<typeof selectProjectContext>,
  options?: CodingAgentOptions
): Promise<unknown> {
  const providerId = options?.aiConfig?.providerId;
  const isDirectGemini = providerId === 'google-gemini' && options?.aiConfig?.keySource === 'byok';

  if (isDirectGemini) {
    return runGeminiAgent(prompt, context, options);
  }

  // Developer IDE Primary: Hugging Face Qwen3-Coder
  try {
    return await runHuggingFaceAgent(prompt, context, options);
  } catch (hfErr) {
    // Check if Hugging Face is unavailable (provider outage, 5xx, network failure)
    const isUnavailable =
      hfErr instanceof HuggingFaceUnavailableError ||
      (hfErr as { name?: string })?.name === 'HuggingFaceUnavailableError' ||
      (hfErr as { status?: number })?.status === 503 ||
      (hfErr instanceof Error && (
        hfErr.message.toLowerCase().includes('unavailable') ||
        hfErr.message.toLowerCase().includes('requesting the provider') ||
        hfErr.message.includes('502') ||
        hfErr.message.includes('503') ||
        hfErr.message.includes('504') ||
        hfErr.message.toLowerCase().includes('fetch failed') ||
        hfErr.message.toLowerCase().includes('network')
      ));

    // Platform quota/credits exhausted on server-side token (HTTP 402)
    const isPlatformQuotaDepleted =
      options?.aiConfig?.keySource !== 'byok' && (
        hfErr instanceof HuggingFaceQuotaError ||
        (hfErr as { name?: string })?.name === 'HuggingFaceQuotaError' ||
        (hfErr as { status?: number })?.status === 402 ||
        (hfErr instanceof Error && (
          hfErr.message.includes('402') ||
          hfErr.message.toLowerCase().includes('balance') ||
          hfErr.message.toLowerCase().includes('insufficient') ||
          hfErr.message.toLowerCase().includes('depleted your monthly included credits') ||
          hfErr.message.toLowerCase().includes('credits or balance is insufficient') ||
          hfErr.message.toLowerCase().includes('quota')
        ))
      );

    // Platform token auth/permission failure (HTTP 401/403)
    const isPlatformAuthFailed =
      options?.aiConfig?.keySource !== 'byok' && (
        hfErr instanceof HuggingFaceAuthError ||
        (hfErr as { name?: string })?.name === 'HuggingFaceAuthError' ||
        (hfErr as { status?: number })?.status === 401 ||
        (hfErr as { status?: number })?.status === 403 ||
        (hfErr instanceof Error && (
          hfErr.message.toLowerCase().includes('permission') ||
          hfErr.message.toLowerCase().includes('authentication') ||
          hfErr.message.toLowerCase().includes('unauthorized') ||
          hfErr.message.toLowerCase().includes('forbidden')
        ))
      );

    const isPlatformToken = options?.aiConfig?.keySource !== 'byok';

    if (isPlatformToken || isUnavailable || isPlatformQuotaDepleted) {
      const geminiKey = process.env.GEMINI_API_KEY?.trim();
      if (!geminiKey) {
        console.warn('[Coding Agent Fallback] Hugging Face failed but GEMINI_API_KEY is not configured in environment.');
      } else {
        const fallbackReason = isPlatformQuotaDepleted
          ? 'Hugging Face platform credits depleted (402). Automatically routed to Gemini fallback.'
          : isPlatformAuthFailed
          ? 'Hugging Face platform token permission/auth error (401/403). Automatically routed to Gemini fallback.'
          : 'Hugging Face unavailable. Gracefully falling back to Gemini.';
        console.warn('[Coding Agent]', fallbackReason, hfErr instanceof Error ? hfErr.message : hfErr);
        const fallbackModel = DEVELOPER_IDE_CONFIG.fallbackModel;
        options?.onFallback?.({
          providerId: DEVELOPER_IDE_CONFIG.fallbackProvider,
          model: fallbackModel,
        });

        const statusCode = isPlatformQuotaDepleted ? 402 : isPlatformAuthFailed ? 403 : 503;

        // Non-blocking telemetry tracking for Admin Panel
        logProviderEvent({
          provider: 'huggingface',
          status: 'fallback',
          eventType: 'fallback_triggered',
          statusCode,
          message: fallbackReason,
        }).catch(() => { });

        logSystemError({
          severity: 'WARNING',
          category: 'AI_PROVIDER',
          provider: 'huggingface',
          statusCode,
          message: `${fallbackReason} Upstream error: ${hfErr instanceof Error ? hfErr.message : 'Provider Failure'}`,
        }).catch(() => { });

        return await runGeminiAgent(prompt, context, {
          ...options,
          aiConfig: {
            apiKey: geminiKey,
            model: fallbackModel,
            providerId: DEVELOPER_IDE_CONFIG.fallbackProvider,
            keySource: 'platform',
          },
        });
      }
    }

    throw hfErr;
  }
}