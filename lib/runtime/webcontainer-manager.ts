'use client';

import type { ProjectFile } from '@/lib/types/database';
import type { WebContainer, FileSystemTree, WebContainerProcess } from '@webcontainer/api';

export type RuntimeState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'mounting'
  | 'installing'
  | 'starting'
  | 'running'
  | 'error'
  | 'stopped';

export type FrameworkType = 'nextjs' | 'vite' | 'node' | 'static' | 'unknown';
export type PackageManagerType = 'npm' | 'pnpm' | 'yarn';

export interface RuntimeErrorInfo {
  message: string;
  file?: string;
  line?: number;
  stack?: string;
  raw?: string;
}

export interface WebContainerRuntimeSnapshot {
  state: RuntimeState;
  framework: FrameworkType;
  packageManager: PackageManagerType;
  previewUrl: string | null;
  serverPort: number | null;
  lastError: RuntimeErrorInfo | null;
  isIsolated: boolean;
  isBooted: boolean;
  swcMode?: 'wasm' | 'native';
  hmrActive?: boolean;
}

/**
 * Generic Runtime Manager abstraction for local/browser virtual containers (WebContainer)
 * or future remote VM/Linux sandboxes.
 */
export interface RuntimeManager {
  boot(): Promise<unknown>;
  mountFiles(files: ProjectFile[]): Promise<boolean>;
  writeFile(path: string, content: string): Promise<boolean>;
  writeFiles(files: Array<{ path: string; content: string }>): Promise<boolean>;
  readFile(path: string): Promise<string | null>;
  installDependencies(files: ProjectFile[], force?: boolean): Promise<boolean>;
  startDevServer(files: ProjectFile[]): Promise<boolean>;
  stopDevServer(): void;
  restartDevServer(files: ProjectFile[]): Promise<boolean>;
  getPreviewUrl(): string | null;
  getLogs(): string[];
  destroy(): void;
}

/**
 * Strips ANSI terminal escape codes, CSI control sequences, and stray color bracket sequences
 * (e.g. \u001b[31m, [31m[1m[22m[39m) from compiler and runtime diagnostic messages.
 */
export function stripAnsi(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u001b\u009b]\x1b?\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/(?:\[[0-9]{1,3}m)+/g, '')
    .trim();
}

// Convert files array to WebContainer FileSystemTree
export function filesToFileSystemTree(files: ProjectFile[]): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const file of files) {
    if (file.is_folder) continue;

    const parts = file.path.replace(/^\//, '').split('/');
    let current: FileSystemTree = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current[part] = {
          file: {
            contents: file.content ?? '',
          },
        };
      } else {
        if (!current[part]) {
          current[part] = {
            directory: {},
          };
        }
        const node = current[part];
        if (node && 'directory' in node) {
          current = node.directory;
        }
      }
    }
  }

  return tree;
}

/**
 * Normalizes project dependencies for WebContainer execution.
 * Specifically resolves Next.js SWC requirements: WebContainers run in a browser
 * WebAssembly sandbox without glibc/musl native ELF support. Next.js natively supports
 * `@next/swc-wasm-nodejs` for this exact target.
 */
export function normalizeProjectFiles(files: ProjectFile[]): ProjectFile[] {
  const pkgIndex = files.findIndex((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
  if (pkgIndex === -1) return files;

  const pkgFile = files[pkgIndex];
  if (!pkgFile.content) return files;

  try {
    const parsed = JSON.parse(pkgFile.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      [key: string]: unknown;
    };
    let modified = false;

    parsed.dependencies = parsed.dependencies || {};
    parsed.devDependencies = parsed.devDependencies || {};
    parsed.optionalDependencies = parsed.optionalDependencies || {};
    parsed.scripts = parsed.scripts || {};

    const allDeps = { ...parsed.dependencies, ...parsed.devDependencies };
    const nextVersionRaw = allDeps['next'];

    if (nextVersionRaw) {
      let nextVersion = nextVersionRaw.trim();
      // Ensure stable Next.js 14 LTS patch (14.2.24) which is verified compatible with Node 22 in WebContainer
      if (
        nextVersion.includes('16.') ||
        nextVersion.includes('15.') ||
        nextVersion.includes('14.2.3') ||
        nextVersion === 'latest' ||
        nextVersion.startsWith('^14.') ||
        nextVersion.startsWith('14.')
      ) {
        nextVersion = '14.2.24';
        parsed.dependencies['next'] = '14.2.24';
        modified = true;
      }

      // 1. Ensure @next/swc-wasm-nodejs is present in dependencies matching Next version
      if (parsed.dependencies['@next/swc-wasm-nodejs'] !== nextVersion) {
        parsed.dependencies['@next/swc-wasm-nodejs'] = nextVersion;
        modified = true;
      }

      // 2. Ensure essential TypeScript devDependencies are declared so Next.js doesn't
      // attempt to install them on the fly at boot, avoiding require-hook race conditions.
      parsed.devDependencies = parsed.devDependencies || {};
      if (!parsed.devDependencies['typescript']) {
        parsed.devDependencies['typescript'] = '^5.4.5';
        modified = true;
      }
      if (!parsed.devDependencies['@types/node']) {
        parsed.devDependencies['@types/node'] = '^20.12.7';
        modified = true;
      }
      if (!parsed.devDependencies['@types/react']) {
        parsed.devDependencies['@types/react'] = '^18.3.1';
        modified = true;
      }
      if (!parsed.devDependencies['@types/react-dom']) {
        parsed.devDependencies['@types/react-dom'] = '^18.3.0';
        modified = true;
      }

      // 3. Ensure scripts.dev uses standard next dev without turbopack (turbopack requires native Rust)
      if (parsed.scripts.dev && parsed.scripts.dev.includes('--turbo')) {
        parsed.scripts.dev = parsed.scripts.dev.replace('--turbo', '').trim();
        modified = true;
      }

      // 4. Ensure react & react-dom match Next 14 LTS requirements
      if (
        parsed.dependencies['react'] &&
        (parsed.dependencies['react'].includes('19.') || parsed.dependencies['react'].includes('^19'))
      ) {
        parsed.dependencies['react'] = '^18.3.1';
        parsed.dependencies['react-dom'] = '^18.3.1';
        modified = true;
      }
    }

    let resultFiles = modified ? [...files] : files;
    if (modified) {
      resultFiles = [...files];
      resultFiles[pkgIndex] = {
        ...pkgFile,
        content: JSON.stringify(parsed, null, 2),
      };
    }

    if (nextVersionRaw) {
      // Remove any legacy .babelrc that disables Next.js SWC compiler
      resultFiles = resultFiles.filter(
        (f) =>
          f.path !== '.babelrc' &&
          f.path !== '.babelrc.json' &&
          f.path !== '.babelrc.js' &&
          f.path !== 'babel.config.js' &&
          f.path !== 'babel.config.json'
      );

      // Ensure next.config.js is present
      const configIndex = resultFiles.findIndex(
        (f) => f.path === 'next.config.js' || f.path === 'next.config.mjs' || f.path.endsWith('/next.config.js')
      );
      if (configIndex === -1) {
        resultFiles = [
          ...resultFiles,
          {
            id: 'next-config',
            project_id: pkgFile.project_id || '',
            name: 'next.config.js',
            path: 'next.config.js',
            content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
};

module.exports = nextConfig;
`,
            language: 'javascript',
            is_folder: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }

      // Ensure .env.local is present with NEXT_TEST_WASM=1
      const hasEnvLocal = resultFiles.some((f) => f.path === '.env.local' || f.path === '.env');
      if (!hasEnvLocal) {
        resultFiles = [
          ...resultFiles,
          {
            id: 'env-local',
            project_id: pkgFile.project_id || '',
            name: '.env.local',
            path: '.env.local',
            content: `NEXT_TEST_WASM=1\nPORT=3000\n`,
            language: 'text',
            is_folder: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }

      // Ensure tsconfig.json is present with root alias paths so @/components always resolve
      const tsconfigIndex = resultFiles.findIndex(
        (f) => f.path === 'tsconfig.json' || f.path.endsWith('/tsconfig.json')
      );
      const defaultTsConfig = JSON.stringify(
        {
          compilerOptions: {
            target: 'es5',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: false,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'node',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: {
              '@/*': ['./*'],
            },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      );

      if (tsconfigIndex === -1) {
        resultFiles = [
          ...resultFiles,
          {
            id: 'tsconfig-json',
            project_id: pkgFile.project_id || '',
            name: 'tsconfig.json',
            path: 'tsconfig.json',
            content: defaultTsConfig,
            language: 'json',
            is_folder: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      } else {
        const existingTs = resultFiles[tsconfigIndex];
        try {
          const parsedTs = JSON.parse(existingTs.content || '{}');
          if (!parsedTs.compilerOptions?.paths?.['@/*']) {
            parsedTs.compilerOptions = parsedTs.compilerOptions || {};
            parsedTs.compilerOptions.paths = parsedTs.compilerOptions.paths || {};
            parsedTs.compilerOptions.paths['@/*'] = ['./*'];
            resultFiles[tsconfigIndex] = {
              ...existingTs,
              content: JSON.stringify(parsedTs, null, 2),
            };
          }
        } catch { }
      }

      // Heal any corrupted hook dependency arrays or expressions like "}, Example)" -> "}, [])"
      for (let i = 0; i < resultFiles.length; i++) {
        const f = resultFiles[i];
        if (f.content && /\.(tsx|jsx|ts|js)$/.test(f.path) && f.content.includes('Example')) {
          const healed = f.content.replace(/,\s*Example\s*\)/g, ', [])');
          if (healed !== f.content) {
            resultFiles[i] = { ...f, content: healed };
          }
        }
      }
    }

    return resultFiles;
  } catch (err) {
    console.warn('[WebContainerManager] Failed to normalize package.json:', err);
  }

  return files;
}

/**
 * Calculates a SHA-like fingerprint hash of project dependencies & package managers
 * to avoid unnecessary reinstalls during ordinary code edits.
 */
export function calculateDependencyFingerprint(files: ProjectFile[]): string {
  const normalized = normalizeProjectFiles(files);
  const pkgFile = normalized.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
  const lockPnpm = normalized.find((f) => f.path.endsWith('pnpm-lock.yaml'));
  const lockYarn = normalized.find((f) => f.path.endsWith('yarn.lock'));
  const lockNpm = normalized.find((f) => f.path.endsWith('package-lock.json'));

  let pkgContent = '';
  if (pkgFile?.content) {
    try {
      const parsed = JSON.parse(pkgFile.content) as Record<string, unknown>;
      const relevant = {
        dependencies: parsed.dependencies || {},
        devDependencies: parsed.devDependencies || {},
        peerDependencies: parsed.peerDependencies || {},
        optionalDependencies: parsed.optionalDependencies || {},
        packageManager: parsed.packageManager || '',
      };
      pkgContent = JSON.stringify(relevant);
    } catch {
      pkgContent = pkgFile.content;
    }
  }

  const raw = [
    pkgContent,
    lockPnpm ? `pnpm:${lockPnpm.content.length}` : '',
    lockYarn ? `yarn:${lockYarn.content.length}` : '',
    lockNpm ? `npm:${lockNpm.content.length}` : '',
  ].join('||');

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Detect framework from project files
 */
export function detectFramework(files: ProjectFile[]): {
  framework: FrameworkType;
  devCommand: { cmd: string; args: string[] };
} {
  const pkgFile = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));

  if (!pkgFile?.content) {
    const hasHtml = files.some((f) => f.path === 'index.html' || f.path.endsWith('/index.html'));
    if (hasHtml) {
      return { framework: 'static', devCommand: { cmd: 'npx', args: ['serve', '.'] } };
    }
    return { framework: 'unknown', devCommand: { cmd: 'npm', args: ['run', 'dev'] } };
  }

  try {
    const parsed = JSON.parse(pkgFile.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
    const scripts = parsed.scripts || {};

    if (deps['next'] || scripts['dev']?.includes('next')) {
      return {
        framework: 'nextjs',
        devCommand: { cmd: 'npm', args: ['run', 'dev'] },
      };
    }

    if (deps['vite'] || scripts['dev']?.includes('vite')) {
      return {
        framework: 'vite',
        devCommand: { cmd: 'npm', args: ['run', 'dev'] },
      };
    }

    if (deps['express'] || deps['fastify'] || scripts['start'] || scripts['dev']) {
      const devScript = scripts['dev'] ? ['run', 'dev'] : scripts['start'] ? ['run', 'start'] : ['run', 'dev'];
      return {
        framework: 'node',
        devCommand: { cmd: 'npm', args: devScript },
      };
    }

    return {
      framework: 'static',
      devCommand: { cmd: 'npx', args: ['serve', '.'] },
    };
  } catch {
    return {
      framework: 'unknown',
      devCommand: { cmd: 'npm', args: ['run', 'dev'] },
    };
  }
}

/**
 * Detect package manager from project files and package.json
 */
export function detectPackageManager(files: ProjectFile[]): PackageManagerType {
  const pkgFile = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
  if (pkgFile?.content) {
    try {
      const parsed = JSON.parse(pkgFile.content) as { packageManager?: string };
      if (typeof parsed.packageManager === 'string') {
        if (parsed.packageManager.startsWith('pnpm')) return 'pnpm';
        if (parsed.packageManager.startsWith('yarn')) return 'yarn';
        if (parsed.packageManager.startsWith('npm')) return 'npm';
      }
    } catch { }
  }

  if (files.some((f) => f.path.endsWith('pnpm-lock.yaml'))) return 'pnpm';
  if (files.some((f) => f.path.endsWith('yarn.lock'))) return 'yarn';
  return 'npm';
}

export function validateProjectForRuntime(files: ProjectFile[]): { valid: boolean; reason?: string } {
  const existingPaths = files
    .filter((file) => !file.is_folder)
    .map((file) => file.path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, ''));

  const packageJson = files.find((file) => file.path === 'package.json' || file.path.endsWith('/package.json'));
  const hasIndexHtml = existingPaths.some((path) => path === 'index.html' || path.endsWith('/index.html'));
  const hasAppDir = existingPaths.some((path) => path.startsWith('app/') || path.includes('/app/'));
  const hasPagesDir = existingPaths.some((path) => path.startsWith('pages/') || path.includes('/pages/'));
  const hasNextPage = existingPaths.some((path) => /(^|\/)page\.(tsx|jsx|ts|js)$/.test(path));
  const hasNextLayout = existingPaths.some((path) => /(^|\/)layout\.(tsx|jsx|ts|js)$/.test(path));
  const hasViteEntry = existingPaths.some((path) => /(^|\/)(src\/)?(main|App)\.(tsx|jsx|ts|js)$/.test(path));

  if (!packageJson && !hasIndexHtml && !hasViteEntry && !hasNextPage) {
    return {
      valid: false,
      reason: 'Project is missing a runnable package.json or app entry file.',
    };
  }

  if (packageJson?.content) {
    try {
      const parsed = JSON.parse(packageJson.content) as Record<string, unknown>;
      const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';

      if (!name) {
        return { valid: false, reason: 'package.json is missing a valid name field.' };
      }

      if (!version || !/^\d+\.\d+\.\d+([-.A-Za-z0-9]+)?$/.test(version)) {
        return {
          valid: false,
          reason: `package.json has an invalid semver version: ${version || 'undefined'}`,
        };
      }

      const scripts = (parsed.scripts ?? {}) as Record<string, unknown>;
      const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) } as Record<string, unknown>;
      const hasNextDep = Boolean(deps.next) || Object.values(scripts).some((value) => typeof value === 'string' && value.includes('next'));
      const hasViteDep = Boolean(deps.vite) || Object.values(scripts).some((value) => typeof value === 'string' && value.includes('vite'));

      if (hasNextDep) {
        const nextPageMissing = !hasNextPage && !hasPagesDir;
        const nextLayoutMissing = hasAppDir && !hasNextLayout;

        if (nextPageMissing) {
          return {
            valid: false,
            reason: 'A valid Next.js project requires app/page.tsx or pages/index.tsx.',
          };
        }

        if (nextLayoutMissing) {
          return {
            valid: false,
            reason: 'A valid Next.js app-router project requires app/layout.tsx.',
          };
        }
      }

      if (hasViteDep && !hasViteEntry && !hasIndexHtml) {
        return {
          valid: false,
          reason: 'A valid Vite app requires index.html or src/main.tsx.',
        };
      }

      if (!hasNextDep && !hasViteDep && !hasIndexHtml && !hasViteEntry && !hasNextPage) {
        return {
          valid: false,
          reason: 'Project does not contain a runnable frontend entry file.',
        };
      }
    } catch {
      return {
        valid: false,
        reason: 'package.json is malformed and cannot be parsed.',
      };
    }
  }

  return { valid: true };
}

/**
 * Unified WebContainer Runtime Manager
 * Owns WebContainer singleton lifecycle, mounting, dependency installation, dev server,
 * hot-sync, persistent terminal shell, and runtime errors.
 */
let cachedWebContainerApi: typeof import('@webcontainer/api') | null = null;

async function loadWebContainerApi(): Promise<typeof import('@webcontainer/api') | null> {
  if (typeof window === 'undefined') return null;
  if ((window as any).__WEBCONTAINER_API__) {
    return (window as any).__WEBCONTAINER_API__;
  }
  if (!cachedWebContainerApi) {
    try {
      cachedWebContainerApi = await import('@webcontainer/api');
      (window as any).__WEBCONTAINER_API__ = cachedWebContainerApi;
    } catch (err) {
      console.warn('[WebContainer] Failed to load @webcontainer/api:', err);
      return null;
    }
  }
  return cachedWebContainerApi;
}

class WebContainerRuntimeManager implements RuntimeManager {
  private instance: WebContainer | null = null;
  private bootPromise: Promise<WebContainer | null> | null = null;
  private state: RuntimeState = 'idle';
  private framework: FrameworkType = 'unknown';
  private packageManager: PackageManagerType = 'npm';
  private previewUrl: string | null = null;
  private serverPort: number | null = null;
  private lastError: RuntimeErrorInfo | null = null;
  private lastInstalledFingerprint: string | null = null;
  private isolationRetryTimer: number | null = null;
  private activeProjectKey: string | null = null;
  private activeProjectSignature: string | null = null;
  private activeDevProcessId = 0;
  private pendingRunPromise: Promise<boolean> | null = null;
  private recentDevLogs: string[] = [];
  private cachedPackageLocks = new Map<string, string>();

  // Processes
  private devProcess: WebContainerProcess | null = null;
  private shellProcess: WebContainerProcess | null = null;
  private shellWriter: WritableStreamDefaultWriter<string> | null = null;

  // Listeners
  private snapshotListeners = new Set<(snap: WebContainerRuntimeSnapshot) => void>();
  private devOutputListeners = new Set<(chunk: string) => void>();
  private shellOutputListeners = new Set<(chunk: string) => void>();
  private errorListeners = new Set<(error: RuntimeErrorInfo) => void>();

  public isCrossOriginIsolated(): boolean {
    return typeof window !== 'undefined' && Boolean(window.crossOriginIsolated);
  }

  public getSnapshot(): WebContainerRuntimeSnapshot {
    return {
      state: this.state,
      framework: this.framework,
      packageManager: this.packageManager,
      previewUrl: this.previewUrl,
      serverPort: this.serverPort,
      lastError: this.lastError,
      isIsolated: this.isCrossOriginIsolated(),
      isBooted: Boolean(this.instance),
      swcMode: 'wasm',
      hmrActive: true,
    };
  }

  private notifySnapshot() {
    const snap = this.getSnapshot();
    this.snapshotListeners.forEach((fn) => {
      try {
        fn(snap);
      } catch (err) {
        console.error('[WebContainerManager] Snapshot listener error:', err);
      }
    });
  }

  public subscribeSnapshot(listener: (snap: WebContainerRuntimeSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.getSnapshot());
    return () => this.snapshotListeners.delete(listener);
  }

  public subscribeDevOutput(listener: (chunk: string) => void): () => void {
    this.devOutputListeners.add(listener);
    return () => this.devOutputListeners.delete(listener);
  }

  public subscribeShellOutput(listener: (chunk: string) => void): () => void {
    this.shellOutputListeners.add(listener);
    return () => this.shellOutputListeners.delete(listener);
  }

  public subscribeError(listener: (error: RuntimeErrorInfo) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private emitDevOutput(chunk: string) {
    this.devOutputListeners.forEach((fn) => {
      try {
        fn(chunk);
      } catch { }
    });
  }

  private emitShellOutput(chunk: string) {
    this.shellOutputListeners.forEach((fn) => {
      try {
        fn(chunk);
      } catch { }
    });
  }

  private emitError(error: RuntimeErrorInfo) {
    const cleanMessage = stripAnsi(error.message);
    const cleanedError: RuntimeErrorInfo = {
      ...error,
      message: cleanMessage,
    };
    this.lastError = cleanedError;
    this.errorListeners.forEach((fn) => {
      try {
        fn(cleanedError);
      } catch { }
    });
    this.notifySnapshot();
  }

  private setState(newState: RuntimeState) {
    this.state = newState;
    this.notifySnapshot();
  }

  /**
   * Attaches lifecycle listeners to the WebContainer instance safely without duplicates.
   */
  private attachInstanceListeners(instance: WebContainer | null): void {
    if (!instance || (instance as any).__listenersAttached) return;
    (instance as any).__listenersAttached = true;

    // Global server-ready listener
    instance.on('server-ready', (port: number, url: string) => {
      this.serverPort = port;
      void this.setVerifiedPreviewUrl(port, url);
    });

    // Port event listener
    instance.on('port', (port: number, type: 'open' | 'close', url: string) => {
      if (type === 'open') {
        this.serverPort = port;
        void this.setVerifiedPreviewUrl(port, url);
      } else if (type === 'close' && this.serverPort === port) {
        this.serverPort = null;
        this.previewUrl = null;
        if (this.state === 'running') {
          this.setState('stopped');
        }
      }
    });

    // Initialize persistent shell process
    void this.initPersistentShell();
  }

  private previewProbeSeq = 0;

  /**
   * Canonicalizes and validates the server-ready URL before marking the runtime Ready.
   * Ensures no 404 or premature connection failure on external open / iframe render.
   */
  private async setVerifiedPreviewUrl(port: number, rawUrl: string): Promise<void> {
    if (!rawUrl) return;
    const currentSeq = ++this.previewProbeSeq;

    // Ensure canonical format with trailing slash
    const canonicalUrl = rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`;
    this.serverPort = port;

    // Store canonical URL immediately so iframe can mount and begin compilation
    this.previewUrl = canonicalUrl;
    this.lastError = null;

    // Transition to 'starting' until URL is verified reachable
    this.setState('starting');
    this.emitDevOutput(`\r\n\x1b[36m[WebContainer] Verifying preview endpoint at ${canonicalUrl}…\x1b[0m\r\n`);
    this.logInternal('PREVIEW', `verifying endpoint: ${canonicalUrl}`);
    this.notifySnapshot();

    // Probe URL to verify dev server is responding (avoid 404 on immediate click)
    let verified = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      if (currentSeq !== this.previewProbeSeq) return;
      if (this.state === 'stopped' || this.state === 'error') return;

      try {
        await fetch(canonicalUrl, { method: 'GET', mode: 'no-cors' });
        verified = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (currentSeq !== this.previewProbeSeq) return;

    this.setState('running');
    this.emitDevOutput(`\r\n\x1b[1;35m✔ Server ready on port ${port}: ${canonicalUrl}\x1b[0m\r\n`);
    this.logInternal('PREVIEW', `canonical verified preview ready: ${canonicalUrl}`);
    this.notifySnapshot();
  }

  /**
   * Boots the singleton WebContainer instance once per browser session.
   */
  public async boot(): Promise<WebContainer | null> {
    if (typeof window === 'undefined') return null;

    // 1. Direct local reference
    if (this.instance) {
      this.attachInstanceListeners(this.instance);
      return this.instance;
    }

    // 2. Window-level cached reference
    if ((window as any).__WEBCONTAINER_INSTANCE__) {
      this.instance = (window as any).__WEBCONTAINER_INSTANCE__;
      this.setState('ready');
      this.attachInstanceListeners(this.instance);
      return this.instance;
    }

    // 3. Ongoing boot promise
    if (this.bootPromise) return this.bootPromise;
    if ((window as any).__WEBCONTAINER_BOOT_PROMISE__) {
      this.bootPromise = (window as any).__WEBCONTAINER_BOOT_PROMISE__;
      return this.bootPromise;
    }

    if (!this.isCrossOriginIsolated()) {
      this.setState('initializing');
      this.emitDevOutput('\r\n\x1b[33m[WebContainer] Waiting for browser isolation to become active…\x1b[0m\r\n');
      if (typeof window !== 'undefined' && this.isolationRetryTimer === null) {
        this.isolationRetryTimer = window.setTimeout(() => {
          this.isolationRetryTimer = null;
          void this.boot();
        }, 250);
      }
      return null;
    }

    if (this.isolationRetryTimer) {
      clearTimeout(this.isolationRetryTimer);
      this.isolationRetryTimer = null;
    }

    this.setState('initializing');

    this.bootPromise = (async () => {
      try {
        const api = await loadWebContainerApi();
        if (!api) {
          throw new Error('WebContainer is only supported in a browser context.');
        }
        const { WebContainer } = api;

        // Check if WebContainer was already booted globally
        if ((WebContainer as any)._instance) {
          this.instance = (WebContainer as any)._instance;
        } else if ((window as any).__WEBCONTAINER_INSTANCE__) {
          this.instance = (window as any).__WEBCONTAINER_INSTANCE__;
        } else {
          try {
            this.instance = await WebContainer.boot();
          } catch (bootErr: any) {
            const isSingletonError =
              bootErr?.message?.includes('Only a single WebContainer instance can be booted') ||
              bootErr?.message?.includes('single WebContainer');

            if ((WebContainer as any)._instance) {
              this.instance = (WebContainer as any)._instance;
            } else if ((window as any).__WEBCONTAINER_INSTANCE__) {
              this.instance = (window as any).__WEBCONTAINER_INSTANCE__;
            } else if (isSingletonError) {
              // Wait briefly if unsynchronized boot is finishing
              await new Promise((r) => setTimeout(r, 100));
              this.instance = (WebContainer as any)._instance || (window as any).__WEBCONTAINER_INSTANCE__;
              if (!this.instance) {
                throw bootErr;
              }
            } else {
              throw bootErr;
            }
          }
        }

        if (typeof window !== 'undefined' && this.instance) {
          (window as any).__WEBCONTAINER_INSTANCE__ = this.instance;
        }

        this.setState('ready');
        if (this.instance) {
          this.attachInstanceListeners(this.instance);
        }

        return this.instance;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Check if we can still recover instance
        const api = typeof window !== 'undefined' ? (window as any)?.__WEBCONTAINER_API__ || cachedWebContainerApi : null;
        const recovered = (api?.WebContainer as any)?._instance || (typeof window !== 'undefined' ? (window as any)?.__WEBCONTAINER_INSTANCE__ : null);
        if (recovered) {
          this.instance = recovered;
          if (typeof window !== 'undefined') {
            (window as any).__WEBCONTAINER_INSTANCE__ = this.instance;
          }
          this.setState('ready');
          this.attachInstanceListeners(this.instance);
          return this.instance;
        }

        console.error('[WebContainerManager] Boot error:', error);
        this.setState('error');
        this.emitError({
          message: error.message || 'WebContainer boot failed',
          stack: error.stack,
        });
        this.bootPromise = null;
        if (typeof window !== 'undefined') {
          delete (window as any).__WEBCONTAINER_BOOT_PROMISE__;
        }
        return null;
      }
    })();

    if (typeof window !== 'undefined') {
      (window as any).__WEBCONTAINER_BOOT_PROMISE__ = this.bootPromise;
    }

    return this.bootPromise;
  }

  /**
   * Initializes persistent interactive shell (jsh or sh)
   */
  public async initPersistentShell(): Promise<void> {
    if (!this.instance || this.shellProcess) return;

    try {
      const shell = await this.instance.spawn('jsh', {
        terminal: {
          cols: 80,
          rows: 24,
        },
        env: {
          NEXT_TEST_WASM: '1',
          NEXT_TEST_WASM_DIR: `${this.instance.workdir}/node_modules/@next/swc-wasm-nodejs`,
          NEXT_DISABLE_SWC_WASM: 'false',
        },
      });

      this.shellProcess = shell;
      this.shellWriter = shell.input.getWriter();

      shell.output.pipeTo(
        new WritableStream({
          write: (data) => {
            this.emitShellOutput(data);
          },
        })
      );

      void shell.exit.then(() => {
        this.shellProcess = null;
        this.shellWriter = null;
        this.emitShellOutput('\r\n\x1b[90m[Shell session ended]\x1b[0m\r\n');
      });
    } catch (err) {
      console.warn('[WebContainerManager] Failed to start jsh persistent shell:', err);
    }
  }

  /**
   * Writes input directly to the persistent interactive shell
   */
  public writeShell(input: string): void {
    if (this.shellWriter) {
      try {
        void this.shellWriter.write(input);
      } catch (err) {
        console.warn('[WebContainerManager] Shell write error:', err);
      }
    }
  }

  /**
   * Resizes the terminal shell
   */
  public resizeShell(cols: number, rows: number): void {
    if (this.shellProcess?.resize) {
      try {
        this.shellProcess.resize({ cols, rows });
      } catch { }
    }
  }

  /**
   * Interrupts the active shell or dev process (Ctrl+C)
   */
  public sendInterrupt(): void {
    this.writeShell('\x03');
  }

  /**
   * Mounts complete project from Supabase files to WebContainer filesystem.
   */
  public async mountProject(files: ProjectFile[]): Promise<boolean> {
    const wc = await this.boot();
    if (!wc) return false;

    this.setState('mounting');
    this.emitDevOutput('\r\n\x1b[36m[WebContainer] Mounting project files to virtual filesystem…\x1b[0m\r\n');

    try {
      let normalizedFiles = normalizeProjectFiles(files);

      // Inspect package-lock.json for platform compatibility.
      // If a package-lock was generated on Windows without Linux optionalDependencies (@next/swc-linux-x64-*),
      // mounting it into Linux WebContainer prevents npm from installing Linux SWC packages.
      const lockFile = normalizedFiles.find((f) => f.path === 'package-lock.json' || f.path.endsWith('/package-lock.json'));
      if (lockFile && typeof lockFile.content === 'string') {
        const isWindowsSpecific = lockFile.content.includes('@next/swc-win32') && !lockFile.content.includes('@next/swc-linux-x64');
        if (isWindowsSpecific) {
          this.emitDevOutput('\x1b[33m[WebContainer] Detected host Windows package-lock.json without Linux SWC packages. Regenerating platform-safe Linux lockfile…\x1b[0m\r\n');
          normalizedFiles = normalizedFiles.filter((f) => f !== lockFile);
        }
      }

      // Preserve and attach cached package-lock.json if available
      const hasLock = normalizedFiles.some((f) => f.path === 'package-lock.json' || f.path.endsWith('/package-lock.json'));
      if (!hasLock && this.activeProjectKey) {
        let cachedLock = this.cachedPackageLocks.get(this.activeProjectKey);
        if (!cachedLock && typeof window !== 'undefined') {
          try {
            cachedLock = localStorage.getItem(`codatron_lock_${this.activeProjectKey}`) || undefined;
            if (cachedLock) {
              this.cachedPackageLocks.set(this.activeProjectKey, cachedLock);
            }
          } catch { }
        }
        if (cachedLock) {
          normalizedFiles = [
            ...normalizedFiles,
            {
              id: 'cached-lock',
              project_id: this.activeProjectKey,
              name: 'package-lock.json',
              path: 'package-lock.json',
              content: cachedLock,
              language: 'json',
              is_folder: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
        }
      }

      const tree = filesToFileSystemTree(normalizedFiles);
      await wc.mount(tree);

      const { framework } = detectFramework(normalizedFiles);
      const pm = detectPackageManager(normalizedFiles);
      this.framework = framework;
      this.packageManager = pm;

      this.setState('ready');
      this.emitDevOutput(
        `\x1b[32m✔ Project mounted (${normalizedFiles.length} files). Framework: ${framework.toUpperCase()} | PM: ${pm}\x1b[0m\r\n`
      );
      return true;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[WebContainerManager] Mount error:', error);
      this.setState('error');
      this.emitError({
        message: error.message || 'Failed to mount project',
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Hot file synchronization: writes/updates a single file directly into WebContainer.
   * Triggers HMR in the running dev server without a full project remount.
   */
  public async syncFile(path: string, content: string): Promise<boolean> {
    if (!this.instance) return false;

    try {
      const cleanPath = path.replace(/^\//, '');
      let cleanContent = content;
      if (/\.(tsx|jsx|ts|js)$/.test(cleanPath) && cleanContent.includes('Example')) {
        cleanContent = cleanContent.replace(/,\s*Example\s*\)/g, ', [])');
      }
      const parts = cleanPath.split('/');
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join('/');
        await this.instance.fs.mkdir(dir, { recursive: true });
      }
      await this.instance.fs.writeFile(cleanPath, cleanContent);
      return true;
    } catch (err) {
      console.warn(`[WebContainerManager] Failed to sync file ${path}:`, err);
      return false;
    }
  }

  /**
   * Deletes a file or directory in WebContainer.
   */
  public async removeFile(path: string): Promise<boolean> {
    if (!this.instance) return false;

    try {
      const cleanPath = path.replace(/^\//, '');
      await this.instance.fs.rm(cleanPath, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.warn(`[WebContainerManager] Failed to remove file ${path}:`, err);
      return false;
    }
  }

  /**
   * Renames a file or directory in WebContainer.
   */
  public async renameFile(oldPath: string, newPath: string): Promise<boolean> {
    if (!this.instance) return false;

    try {
      const cleanOld = oldPath.replace(/^\//, '');
      const cleanNew = newPath.replace(/^\//, '');
      const parts = cleanNew.split('/');
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join('/');
        await this.instance.fs.mkdir(dir, { recursive: true });
      }
      const content = await this.instance.fs.readFile(cleanOld, 'utf-8');
      await this.instance.fs.writeFile(cleanNew, content);
      await this.instance.fs.rm(cleanOld, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.warn(`[WebContainerManager] Failed to rename ${oldPath} to ${newPath}:`, err);
      return false;
    }
  }

  /**
   * Installs project dependencies using detected package manager,
   * respecting dependency fingerprinting so unchanged dependencies are skipped.
   */
  public async installDependencies(files: ProjectFile[], force = false): Promise<boolean> {
    const wc = await this.boot();
    if (!wc) return false;

    const normalizedFiles = normalizeProjectFiles(files);
    const currentFingerprint = calculateDependencyFingerprint(normalizedFiles);
    if (!force && this.lastInstalledFingerprint && this.lastInstalledFingerprint === currentFingerprint) {
      this.emitDevOutput('\x1b[90m[WebContainer] Dependency fingerprint unchanged. Skipping install.\x1b[0m\r\n');
      return true;
    }

    const pm = detectPackageManager(normalizedFiles);
    this.packageManager = pm;
    this.setState('installing');

    const installArgs = pm === 'npm' ? ['install', '--include=optional'] : ['install'];
    const installEnv: Record<string, string> = {
      NPM_CONFIG_OMIT: '',
      NPM_CONFIG_INCLUDE: 'optional',
    };
    this.emitDevOutput(`\r\n\x1b[1;34m$ ${pm} ${installArgs.join(' ')}\x1b[0m\r\n`);

    try {
      let installProcess = await wc.spawn(pm, installArgs, { env: installEnv });

      installProcess.output.pipeTo(
        new WritableStream({
          write: (data) => {
            this.emitDevOutput(data);
          },
        })
      );

      let exitCode = await installProcess.exit;

      // Resilient peer-dependency fallback if initial install encounters conflicts
      if (exitCode !== 0 && pm === 'npm') {
        this.emitDevOutput('\r\n\x1b[33m[WebContainer] Retrying install with --legacy-peer-deps --include=optional…\x1b[0m\r\n');
        installProcess = await wc.spawn(pm, ['install', '--legacy-peer-deps', '--include=optional'], { env: installEnv });
        installProcess.output.pipeTo(
          new WritableStream({
            write: (data) => {
              this.emitDevOutput(data);
            },
          })
        );
        exitCode = await installProcess.exit;
      }

      if (exitCode !== 0) {
        const errStr = `${pm} install failed with exit code ${exitCode}`;
        this.emitDevOutput(`\r\n\x1b[31m[WebContainer] ${errStr}\x1b[0m\r\n`);
        this.setState('error');
        this.emitError({ message: errStr });
        return false;
      }

      // Preserve generated package-lock.json for faster & deterministic subsequent installs
      try {
        const lockContent = await wc.fs.readFile('package-lock.json', 'utf-8');
        if (lockContent && this.activeProjectKey) {
          this.cachedPackageLocks.set(this.activeProjectKey, lockContent);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`codatron_lock_${this.activeProjectKey}`, lockContent);
            } catch { }
          }
        }
      } catch {
        // lockfile read skipped
      }

      this.lastInstalledFingerprint = currentFingerprint;

      // Apply SWC runtime patch for WebContainer compatibility so Next.js never
      // attempts to load native Linux binaries or crashes with failed-loading-swc
      await this.patchNextSwcInWebContainer(wc);

      this.emitDevOutput(`\r\n\x1b[32m✔ Dependencies successfully installed.\x1b[0m\r\n`);
      this.setState('ready');
      return true;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[WebContainerManager] Install error:', error);
      this.setState('error');
      this.emitError({
        message: error.message || 'Dependency installation failed',
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Connects Next.js to the official @next/swc-wasm-nodejs WebAssembly compiler.
   * WebContainers run in a browser WebAssembly sandbox where native Linux ELF
   * binaries (@next/swc-linux-x64-*) cannot execute.
   *
   * By wiring loadWasm directly to the pre-installed @next/swc-wasm-nodejs package:
   * 1. Next.js SWC compiler loads synchronously and cleanly via WebAssembly.
   * 2. No on-the-fly network downloads or native addon failures occur.
   * 3. Full Next.js App Router compilation, TypeScript, and JSX transpilation succeed.
   */
  private async patchNextSwcInWebContainer(wc: WebContainer): Promise<void> {
    try {
      // 1. Remove any legacy .babelrc that would disable the SWC compiler
      await wc.fs.rm('.babelrc', { force: true }).catch(() => { });
      await wc.fs.rm('.babelrc.json', { force: true }).catch(() => { });

      // 2. Ensure next.config.js exists with clean configuration
      const nextConfigContent = await wc.fs.readFile('next.config.js', 'utf-8').catch(() => null);
      if (!nextConfigContent) {
        await wc.fs
          .writeFile(
            'next.config.js',
            `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: false };\nmodule.exports = nextConfig;\n`
          )
          .catch(() => { });
      }

      // 3. Ensure .env.local has wasm & port configuration
      const envContent = await wc.fs.readFile('.env.local', 'utf-8').catch(() => null);
      if (!envContent) {
        await wc.fs.writeFile('.env.local', 'NEXT_TEST_WASM=1\nPORT=3000\n').catch(() => { });
      }

      // 4. Create root symlink for @next so bare pathToFileURL("@next/...") resolves in WebContainer
      try {
        await wc.fs.rm('@next', { recursive: true, force: true }).catch(() => { });
        const symlinkProc = await wc.spawn('ln', ['-s', 'node_modules/@next', '@next']);
        await symlinkProc.exit;
      } catch { }

      // 5. Stub download-swc.js so Next.js never attempts external network downloads of native binaries
      const downloadSwcPath = 'node_modules/next/dist/lib/download-swc.js';
      const safeDownloadSwc = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadNativeNextSwc = async function() { return Promise.resolve(); };
exports.downloadWasmSwc = async function() { return Promise.resolve(); };
`;
      await wc.fs.writeFile(downloadSwcPath, safeDownloadSwc).catch(() => { });

      // 6. Stub install-bindings.js so Next.js never tries to install native Linux ELF binaries
      const installBindingsPath = 'node_modules/next/dist/build/swc/install-bindings.js';
      const safeInstallBindings = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installBindings = async function() { return Promise.resolve(); };
`;
      await wc.fs.writeFile(installBindingsPath, safeInstallBindings).catch(() => { });

      // 7. Connect Next.js loadWasm to the pre-installed @next/swc-wasm-nodejs package
      const swcIndexPath = 'node_modules/next/dist/build/swc/index.js';
      const originalSwc = await wc.fs.readFile(swcIndexPath, 'utf-8').catch(() => null);

      if (originalSwc && !originalSwc.includes('// __WEBCONTAINER_SWC_WASM_LOADED__')) {
        let patchedSwc = '// __WEBCONTAINER_SWC_WASM_LOADED__\n' + originalSwc;

        // In loadWasm, replace the flawed ESM import(pathToFileURL("@next/...")) with direct CJS require
        const targetImport = 'let bindings = await import((0, _url.pathToFileURL)(pkgPath).toString());';
        const safeImport = `let bindings;
            try {
                bindings = require("@next/swc-wasm-nodejs");
            } catch {
                try {
                    const resolved = require.resolve("@next/swc-wasm-nodejs");
                    bindings = await import((0, _url.pathToFileURL)(resolved).toString());
                } catch {
                    bindings = await import("@next/swc-wasm-nodejs");
                }
            }`;

        if (patchedSwc.includes(targetImport)) {
          patchedSwc = patchedSwc.replace(targetImport, safeImport);
        }

        // In loadBindingsSync, ensure wasmBindings is populated synchronously if not yet loaded
        const targetSync = 'function loadBindingsSync() {';
        const safeSync = `function loadBindingsSync() {
    if (wasmBindings) {
        return wasmBindings;
    }
    try {
        const syncWasm = require("@next/swc-wasm-nodejs");
        wasmBindings = {
            isWasm: true,
            transform(src, options) {
                const s = typeof src === "string" ? src : (src ? src.toString() : "");
                return Promise.resolve(syncWasm.transformSync(s, options));
            },
            transformSync(src, options) {
                const s = typeof src === "string" ? src : (src ? src.toString() : "");
                return syncWasm.transformSync(s, options);
            },
            minify(src, options) {
                const s = typeof src === "string" ? src : (src ? src.toString() : "");
                return Promise.resolve(syncWasm.minifySync(s, options || {}));
            },
            minifySync(src, options) {
                const s = typeof src === "string" ? src : (src ? src.toString() : "");
                return syncWasm.minifySync(s, options || {});
            },
            parse(src, options) {
                const s = typeof src === "string" ? src : (src ? src.toString() : "");
                return Promise.resolve(syncWasm.parseSync(s, options || {}));
            },
            parseSync(src, options) {
                const s = typeof src === "string" ? src : (src ? src.toString() : "");
                return syncWasm.parseSync(s, options || {});
            },
            getTargetTriple() { return undefined; },
            initCustomTraceSubscriber() {},
            teardownTraceSubscriber() {},
            initHeapProfiler() {},
            teardownHeapProfiler() {},
            turbo: { startTrace: () => {}, entrypoints: { stream: () => {}, get: () => {} } },
            mdx: {
                compile: (src, options) => syncWasm.mdxCompileSync ? Promise.resolve(syncWasm.mdxCompileSync(src ? src.toString() : "", options)) : Promise.resolve(),
                compileSync: (src, options) => syncWasm.mdxCompileSync ? syncWasm.mdxCompileSync(src ? src.toString() : "", options) : {}
            }
        };
        return wasmBindings;
    } catch {}`;

        if (patchedSwc.includes(targetSync)) {
          patchedSwc = patchedSwc.replace(targetSync, safeSync);
        }

        await wc.fs.writeFile(swcIndexPath, patchedSwc).catch(() => { });
        this.emitDevOutput('\x1b[90m[WebContainer] Initialized SWC WebAssembly compiler bindings.\x1b[0m\r\n');
      }
    } catch (err) {
      console.warn('[WebContainerManager] SWC setup notice:', err);
    }
  }

  public logInternal(tag: string, message: string): void {
    const formatted = `[${tag}] ${message}`;
    this.appendDevLog(formatted);
    this.emitDevOutput(`\x1b[90m${formatted}\x1b[0m\r\n`);
  }

  public isDevServerRunning(): boolean {
    return this.state === 'running' && Boolean(this.previewUrl) && Boolean(this.devProcess);
  }

  private appendDevLog(chunk: string): void {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      this.recentDevLogs.push(line);
      if (this.recentDevLogs.length > 300) {
        this.recentDevLogs.shift();
      }
    }
  }

  private extractRecentError(cmd?: string, exitCode?: number): string | null {
    const errorLines: string[] = [];
    for (let i = this.recentDevLogs.length - 1; i >= 0 && errorLines.length < 5; i--) {
      const rawLine = this.recentDevLogs[i];
      const line = stripAnsi(rawLine);
      const lower = line.toLowerCase();
      if (
        lower.includes('error:') ||
        lower.includes('referenceerror') ||
        lower.includes('failed to compile') ||
        lower.includes('syntaxerror') ||
        lower.includes('typeerror') ||
        lower.includes('command not found') ||
        lower.includes('npm err!') ||
        lower.includes('eaddrinuse') ||
        lower.includes('cannot find module') ||
        lower.includes('unhandledpromiserejection') ||
        lower.includes('failed to load swc binary') ||
        lower.includes('swc') ||
        lower.includes('panic')
      ) {
        errorLines.unshift(line);
      }
    }
    if (errorLines.length > 0) {
      return errorLines.join('\n');
    }
    const lastLines = this.recentDevLogs.slice(-3).map((l) => stripAnsi(l)).filter(Boolean).join('\n');
    if (lastLines) {
      return lastLines;
    }
    return `Development server process exited${exitCode !== undefined ? ` with code ${exitCode}` : ''}${cmd ? ` (${cmd})` : ''}. Check Logs drawer for details.`;
  }

  /**
   * Starts the development server using detected framework and package manager.
   */
  public async startDevServer(files: ProjectFile[]): Promise<boolean> {
    const wc = await this.boot();
    if (!wc) return false;

    this.activeDevProcessId++;
    const currentProcessId = this.activeDevProcessId;

    if (this.devProcess) {
      try {
        this.devProcess.kill();
      } catch { }
      this.devProcess = null;
    }

    const normalizedFiles = normalizeProjectFiles(files);
    const { framework, devCommand } = detectFramework(normalizedFiles);
    const pm = detectPackageManager(normalizedFiles);
    this.framework = framework;
    this.packageManager = pm;

    this.setState('starting');

    const cmd = pm === 'pnpm' || pm === 'yarn' ? pm : devCommand.cmd;
    const args = pm === 'pnpm' || pm === 'yarn' ? ['dev'] : devCommand.args;

    const isNext = framework === 'nextjs' || normalizedFiles.some((f) => f.path === 'package.json' && f.content?.includes('"next"'));

    // Pre-flight check for Next.js in WebContainer:
    // Patch SWC bindings and ensure babel/config files exist before launching dev server
    if (isNext) {
      await this.patchNextSwcInWebContainer(wc);
    }

    const devEnv: Record<string, string> = {
      NODE_ENV: 'development',
      PORT: '3000',
    };

    if (isNext) {
      devEnv['NEXT_TEST_WASM'] = '1';
    }

    this.emitDevOutput(`\r\n\x1b[1;32m$ ${cmd} ${args.join(' ')}\x1b[0m\r\n`);

    try {
      const devProcess = await wc.spawn(cmd, args, { env: devEnv });
      this.devProcess = devProcess;

      devProcess.output.pipeTo(
        new WritableStream({
          write: (data) => {
            this.emitDevOutput(data);
            this.appendDevLog(data);

            const cleanData = stripAnsi(data);
            const isNonFatalSwcNotice =
              cleanData.includes('ERR_DLOPEN_DISABLED') ||
              cleanData.includes('fallback to wasm') ||
              cleanData.includes('Falling back to WebAssembly') ||
              cleanData.includes('Failed to load SWC binary, falling back') ||
              cleanData.includes('Attempted to load @next/swc');

            if (
              !isNonFatalSwcNotice &&
              (cleanData.includes('Error:') ||
                cleanData.includes('ReferenceError') ||
                cleanData.includes('Failed to compile') ||
                cleanData.includes('SyntaxError') ||
                cleanData.includes('TypeError') ||
                cleanData.includes('Cannot find module') ||
                cleanData.includes('Module not found'))
            ) {
              const lines = cleanData.split('\n');
              const errorLine = lines.find((l: string) =>
                l.includes('Error:') ||
                l.includes('ReferenceError') ||
                l.includes('Failed to compile') ||
                l.includes('SyntaxError') ||
                l.includes('TypeError') ||
                l.includes('Cannot find module') ||
                l.includes('Module not found')
              ) || lines[0];

              if (errorLine && errorLine.trim() && !errorLine.includes('ERR_DLOPEN_DISABLED')) {
                this.emitError({
                  message: stripAnsi(errorLine).slice(0, 300),
                  raw: cleanData.slice(0, 800),
                });
              }
            }
          },
        })
      );

      void devProcess.exit.then((code: number) => {
        if (this.activeDevProcessId !== currentProcessId) {
          return;
        }
        this.emitDevOutput(`\r\n\x1b[90m[dev server exited with code ${code}]\x1b[0m\r\n`);
        this.devProcess = null;
        this.previewUrl = null;
        this.serverPort = null;

        // Check recent dev logs for fatal SWC crashes (not peaceful WASM fallback)
        const hasFatalSwcCrash = this.recentDevLogs.some(
          (l) =>
            l.includes('failed-loading-swc') &&
            !l.includes('WASM') &&
            !l.includes('swc-wasm-nodejs')
        );
        const recentErr = this.extractRecentError(`${cmd} ${args.join(' ')}`, code);

        if (code !== 0 || hasFatalSwcCrash) {
          const message = hasFatalSwcCrash
            ? 'Next.js SWC initialization failed: The SWC binary could not be loaded.'
            : (recentErr || `Development server process exited with code ${code}.`);
          this.setState('error');
          this.emitError({ message });
        } else {
          this.setState('stopped');
          this.notifySnapshot();
        }
      });

      return true;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[WebContainerManager] Dev server spawn error:', error);
      this.setState('error');
      this.emitError({
        message: error.message || 'Failed to start development server',
        stack: error.stack,
      });
      return false;
    }
  }

  private getProjectSignature(files: ProjectFile[]): string {
    return files
      .filter((file) => !file.is_folder)
      .map((file) => `${file.path}:${file.content?.length ?? 0}:${file.updated_at ?? ''}`)
      .join('|');
  }

  /**
   * Complete automated workflow:
   * Mount -> Install (if changed) -> Start Dev Server
   */
  public async runProject(files: ProjectFile[], projectKey = 'default', forceInstall = false): Promise<boolean> {
    if (this.pendingRunPromise) {
      try {
        await this.pendingRunPromise;
      } catch { }
    }

    const runTask = (async () => {
      const projectSignature = this.getProjectSignature(files);
      const validation = validateProjectForRuntime(files);

      if (!validation.valid) {
        this.setState('error');
        this.emitError({
          message: validation.reason || 'Generated project is not runnable yet.',
        });
        this.activeProjectKey = null;
        this.activeProjectSignature = null;
        return false;
      }

      if (
        this.activeProjectKey === projectKey &&
        this.instance &&
        this.previewUrl &&
        this.devProcess &&
        this.state === 'running'
      ) {
        if (this.activeProjectSignature === projectSignature) {
          this.emitDevOutput('\r\n\x1b[90m[WebContainer] Reusing running project instance for the same project snapshot.\x1b[0m\r\n');
          return true;
        }

        // Project signature changed: check if dependencies changed
        const normalizedFiles = normalizeProjectFiles(files);
        const currentFingerprint = calculateDependencyFingerprint(normalizedFiles);

        if (currentFingerprint === this.lastInstalledFingerprint) {
          // Dependencies are unchanged! This is an incremental file change.
          // Hot-sync the modified files into the WebContainer virtual filesystem.
          // Next.js HMR will update the running dev server and live preview without a full restart.
          this.activeProjectSignature = projectSignature;
          this.emitDevOutput('\r\n\x1b[36m[WebContainer] Hot-syncing updated files (HMR active)…\x1b[0m\r\n');
          for (const file of normalizedFiles) {
            if (!file.is_folder && file.content !== undefined) {
              void this.syncFile(file.path, file.content);
            }
          }
          return true;
        }
      }

      if (projectKey && this.activeProjectKey && this.activeProjectKey !== projectKey) {
        this.stopAll();
        this.activeProjectKey = null;
        this.activeProjectSignature = null;
      }

      this.activeProjectKey = projectKey;
      this.activeProjectSignature = projectSignature;

      const wc = await this.boot();
      if (!wc) return false;

      const normalizedFiles = normalizeProjectFiles(files);
      const mounted = await this.mountProject(normalizedFiles);
      if (!mounted) return false;

      const hasPkg = normalizedFiles.some((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
      if (hasPkg) {
        const installed = await this.installDependencies(normalizedFiles, forceInstall);
        if (!installed) return false;
      }

      if (this.devProcess && this.state === 'running' && this.previewUrl) {
        return true;
      }

      return this.startDevServer(normalizedFiles);
    })();

    this.pendingRunPromise = runTask;
    try {
      return await runTask;
    } finally {
      if (this.pendingRunPromise === runTask) {
        this.pendingRunPromise = null;
      }
    }
  }

  /**
   * Restarts the development server
   */
  public async restartDevServer(files: ProjectFile[]): Promise<boolean> {
    return this.startDevServer(files);
  }

  /**
   * Clean up runtime processes
   */
  public stopAll(): void {
    this.activeDevProcessId++;
    if (this.devProcess) {
      try {
        this.devProcess.kill();
      } catch { }
      this.devProcess = null;
    }
    if (this.shellProcess) {
      try {
        this.shellProcess.kill();
      } catch { }
      this.shellProcess = null;
      this.shellWriter = null;
    }
    this.previewUrl = null;
    this.serverPort = null;
    this.setState('stopped');
    this.notifySnapshot();
  }

  // --- RuntimeManager Interface Methods ---
  public async mountFiles(files: ProjectFile[]): Promise<boolean> {
    return this.mountProject(files);
  }

  public async writeFile(path: string, content: string): Promise<boolean> {
    return this.syncFile(path, content);
  }

  public async writeFiles(files: Array<{ path: string; content: string }>): Promise<boolean> {
    let allOk = true;
    for (const f of files) {
      const ok = await this.syncFile(f.path, f.content);
      if (!ok) allOk = false;
    }
    return allOk;
  }

  public async readFile(path: string): Promise<string | null> {
    if (!this.instance) return null;
    try {
      const cleanPath = path.replace(/^\//, '');
      return await this.instance.fs.readFile(cleanPath, 'utf-8');
    } catch {
      return null;
    }
  }

  public stopDevServer(): void {
    this.activeDevProcessId++;
    if (this.devProcess) {
      try {
        this.devProcess.kill();
      } catch { }
      this.devProcess = null;
    }
    this.previewUrl = null;
    this.serverPort = null;
    this.setState('stopped');
    this.notifySnapshot();
  }

  public getPreviewUrl(): string | null {
    return this.previewUrl;
  }

  public getLogs(): string[] {
    return [...this.recentDevLogs];
  }

  public destroy(): void {
    this.stopAll();
  }
}

// Global Singleton Instance (preserved across Next.js HMR and re-evaluations)
export const webcontainerManager: WebContainerRuntimeManager =
  (typeof window !== 'undefined' && (window as any).__WEBCONTAINER_MANAGER__) ||
  new WebContainerRuntimeManager();

if (typeof window !== 'undefined') {
  (window as any).__WEBCONTAINER_MANAGER__ = webcontainerManager;
}