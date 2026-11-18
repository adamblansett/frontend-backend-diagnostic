import * as fs from 'node:fs';
import * as path from 'node:path';
import { FbdConfig } from '../types/index.js';

export class ConfigLoader {
  private static readonly CONFIG_NAMES = [
    '.fbdrc.json',
    '.fbdrc',
    'fbd.config.json'
  ];

  public static loadConfig(workspaceRoot: string): FbdConfig | undefined {
    for (const name of this.CONFIG_NAMES) {
      const fullPath = path.join(workspaceRoot, name);
      if (fs.existsSync(fullPath)) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const parsed = JSON.parse(raw) as FbdConfig;
          return parsed;
        } catch {
          // If corrupted config, ignore or return undefined
        }
      }
    }
    return undefined;
  }
}
