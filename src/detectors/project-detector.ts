import * as fs from 'node:fs';
import * as path from 'node:path';
import { DiagnosticContext } from '../types/index.js';
import { ConfigLoader } from './config-loader.js';

export interface ProjectScanResult {
  detectedFrameworks: DiagnosticContext['detectedFrameworks'];
  frontendFiles: string[];
  backendFiles: string[];
  envFiles: string[];
  configFiles: string[];
}

export class ProjectDetector {
  private static readonly DEFAULT_IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.nuxt',
    'coverage',
    '.turbo',
    '.fbd-backup'
  ]);

  public static async scanWorkspace(
    workspaceRoot: string,
    options: DiagnosticContext['options'] = {}
  ): Promise<DiagnosticContext> {
    const config = options.config || ConfigLoader.loadConfig(workspaceRoot);
    const ignorePaths = [
      ...(options.ignorePaths || []),
      ...(config?.ignorePaths || [])
    ];

    const allFiles = this.collectFiles(workspaceRoot, [], ignorePaths);
    const envFiles = allFiles.filter((f) => {
      const base = path.basename(f);
      return base.startsWith('.env') || base.endsWith('.env');
    });

    const configFiles = allFiles.filter((f) => {
      const base = path.basename(f);
      return (
        base.includes('config') ||
        base === 'package.json' ||
        base === 'tsconfig.json' ||
        base === 'openapi.json' ||
        base === 'openapi.yaml' ||
        base === 'openapi.yml' ||
        base === 'swagger.json' ||
        base === 'swagger.yaml' ||
        base === 'swagger.yml' ||
        base === '.fbdrc.json' ||
        base === 'fbd.config.json'
      );
    });

    const openApiPaths = allFiles.filter((f) => {
      const base = path.basename(f).toLowerCase();
      return (
        base === 'openapi.json' ||
        base === 'openapi.yaml' ||
        base === 'openapi.yml' ||
        base === 'swagger.json' ||
        base === 'swagger.yaml' ||
        base === 'swagger.yml'
      );
    });

    const frontendFiles: string[] = [];
    const backendFiles: string[] = [];

    for (const file of allFiles) {
      const rel = path.relative(workspaceRoot, file).toLowerCase();
      if (
        rel.includes('frontend') ||
        rel.includes('client') ||
        rel.includes('ui') ||
        rel.includes('components') ||
        rel.includes('pages') ||
        rel.includes('app/client') ||
        rel.endsWith('.vue') ||
        rel.endsWith('.svelte')
      ) {
        frontendFiles.push(file);
      } else if (
        rel.includes('backend') ||
        rel.includes('server') ||
        rel.includes('api') ||
        rel.includes('routes') ||
        rel.includes('controllers') ||
        rel.includes('services') ||
        rel.includes('handlers')
      ) {
        backendFiles.push(file);
      } else if (
        rel.endsWith('.ts') ||
        rel.endsWith('.js') ||
        rel.endsWith('.jsx') ||
        rel.endsWith('.tsx')
      ) {
        const content = this.safeReadFile(file);
        if (
          content.includes('express') ||
          content.includes('fastify') ||
          content.includes('req, res') ||
          content.includes('Router()') ||
          content.includes('NextResponse') ||
          content.includes('@nestjs')
        ) {
          backendFiles.push(file);
        } else if (
          content.includes('fetch(') ||
          content.includes('axios') ||
          content.includes('useState') ||
          content.includes('React') ||
          content.includes('localStorage') ||
          content.includes('sessionStorage') ||
          content.includes('window.') ||
          content.includes('document.')
        ) {
          frontendFiles.push(file);
        }
      }
    }

    // Inspect package.json if present
    let frontend: string | undefined;
    let backend: string | undefined;

    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.next) frontend = 'Next.js';
        else if (deps.react) frontend = 'React';
        else if (deps.vue) frontend = 'Vue.js';
        else if (deps.svelte) frontend = 'Svelte';
        else if (deps['@angular/core']) frontend = 'Angular';

        if (deps.express) backend = 'Express';
        else if (deps.fastify) backend = 'Fastify';
        else if (deps['@nestjs/core']) backend = 'NestJS';
      } catch {
        // Invalid json, ignore
      }
    }

    // Check for Python backend
    const pyReq = path.join(workspaceRoot, 'requirements.txt');
    if (fs.existsSync(pyReq)) {
      const content = fs.readFileSync(pyReq, 'utf8');
      if (content.includes('fastapi')) backend = 'FastAPI';
      else if (content.includes('flask')) backend = 'Flask';
      else if (content.includes('django')) backend = 'Django';
    }

    return {
      workspaceRoot,
      detectedFrameworks: {
        frontend: frontend || (frontendFiles.length > 0 ? 'Generic Frontend' : undefined),
        backend: backend || (backendFiles.length > 0 ? 'Generic Backend' : undefined),
        apiType: 'REST',
        hasOpenApi: openApiPaths.length > 0,
        openApiPaths
      },
      frontendFiles,
      backendFiles,
      envFiles,
      configFiles,
      interactive: false,
      authorizationGranted: false,
      dryRun: false,
      options: {
        ...options,
        config,
        categories: options.categories || config?.categories,
        strict: options.strict ?? config?.strict,
        verbose: options.verbose ?? config?.verbose
      }
    };
  }

  private static collectFiles(dir: string, fileList: string[] = [], ignorePatterns: string[] = [], rootDir?: string): string[] {
    const resolvedRoot = rootDir ? path.resolve(rootDir) : path.resolve(dir);
    if (!fs.existsSync(dir)) return fileList;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Security: Avoid traversing symlinks that point outside the workspace root
        if (entry.isSymbolicLink()) {
          try {
            const real = fs.realpathSync(fullPath);
            if (!real.startsWith(resolvedRoot + path.sep) && real !== resolvedRoot) {
              continue; // Skip external symlink
            }
          } catch {
            continue; // Broken symlink
          }
        }

        if (entry.isDirectory()) {
          if (!this.DEFAULT_IGNORED_DIRS.has(entry.name) && !this.isIgnored(entry.name, ignorePatterns)) {
            this.collectFiles(fullPath, fileList, ignorePatterns, resolvedRoot);
          }
        } else if (entry.isFile()) {
          if (!this.isIgnored(entry.name, ignorePatterns)) {
            fileList.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore unreadable dirs
    }
    return fileList;
  }

  private static isIgnored(fileNameOrPath: string, ignorePatterns: string[]): boolean {
    for (const pattern of ignorePatterns) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
        if (regex.test(fileNameOrPath)) return true;
      } else if (fileNameOrPath.includes(pattern)) {
        return true;
      }
    }
    return false;
  }

  private static safeReadFile(file: string): string {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  }
}
