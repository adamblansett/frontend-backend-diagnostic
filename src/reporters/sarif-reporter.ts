import { DiagnosticRunSummary } from '../types/index.js';

export class SarifReporter {
  public static generate(summary: DiagnosticRunSummary): string {
    const sarifLevelMap: Record<string, string> = {
      CRITICAL: 'error',
      HIGH: 'error',
      MEDIUM: 'warning',
      LOW: 'note',
      INFORMATIONAL: 'note'
    };

    const rulesMap = new Map<string, { id: string; name: string; shortDescription: { text: string } }>();
    const results = summary.findings.map((f) => {
      if (!rulesMap.has(f.ruleId)) {
        rulesMap.set(f.ruleId, {
          id: f.ruleId,
          name: f.ruleId,
          shortDescription: { text: f.title }
        });
      }

      const primaryLocation = f.evidence.locations?.[0];
      return {
        ruleId: f.ruleId,
        level: sarifLevelMap[f.severity] || 'warning',
        message: {
          text: `${f.title}: ${f.rootCause}. Recommended fix: ${f.recommendedCorrection}`
        },
        locations: primaryLocation
          ? [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: primaryLocation.filePath
                  },
                  region: {
                    startLine: primaryLocation.line || 1,
                    startColumn: primaryLocation.column || 1
                  }
                }
              }
            ]
          : []
      };
    });

    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'frontend-backend-diagnostic',
              version: '1.0.0',
              informationUri: 'https://github.com/adamblansett/frontend-backend-diagnostic',
              rules: Array.from(rulesMap.values())
            }
          },
          results
        }
      ]
    };

    return JSON.stringify(sarif, null, 2);
  }
}
