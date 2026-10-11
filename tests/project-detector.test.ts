import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { ProjectDetector } from '../src/detectors/project-detector.js';

describe('ProjectDetector', () => {
  it('correctly discovers files and env configurations in broken-app', async () => {
    const fixturePath = path.resolve('fixtures/broken-app');
    const context = await ProjectDetector.scanWorkspace(fixturePath);

    expect(context.workspaceRoot).toBe(fixturePath);
    expect(context.frontendFiles.length).toBeGreaterThan(0);
    expect(context.backendFiles.length).toBeGreaterThan(0);
    expect(context.envFiles.length).toBeGreaterThan(0);
    expect(context.envFiles.some((f) => f.includes('.env.local'))).toBe(true);
  });

  it('correctly categorizes frontend and backend files in healthy-app', async () => {
    const fixturePath = path.resolve('fixtures/healthy-app');
    const context = await ProjectDetector.scanWorkspace(fixturePath);

    expect(context.frontendFiles.some((f) => f.includes('client.ts'))).toBe(true);
    expect(context.backendFiles.some((f) => f.includes('server.ts'))).toBe(true);
    expect(context.envFiles.some((f) => f.includes('.env'))).toBe(true);
  });
});
