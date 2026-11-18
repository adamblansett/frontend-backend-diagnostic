import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const SqlInjectionRule: DiagnosticRule = {
  id: 'SEC-INJ-001',
  name: 'SQL / Query String Interpolation Vulnerability',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'CRITICAL',
  description: 'Detects raw database queries formed via string concatenation or template literal interpolation rather than parameterized queries.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,

  execute: async (context: DiagnosticContext): Promise<RuleExecutionResult> => {
    const startTime = Date.now();
    const findings: DiagnosticFinding[] = [];

    // Patterns matching raw SQL queries containing variables or string concatenation
    const SQL_INTERPOLATION_REGEX = /(?:query|execute|raw)\s*\(\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|WHERE)[^`]*\$\{[^}]+\}[^`]*`/i;
    const SQL_CONCAT_REGEX = /(?:query|execute|raw)\s*\(\s*["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|WHERE)[^"']*["']\s*\+\s*[a-zA-Z0-9_.]+/i;

    for (const file of context.backendFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        if (SQL_INTERPOLATION_REGEX.test(line) || SQL_CONCAT_REGEX.test(line)) {
          findings.push({
            id: `FINDING-SEC-INJ-001-${findings.length + 1}`,
            ruleId: 'SEC-INJ-001',
            title: `Potential SQL Injection via unparameterized query in ${file}`,
            severity: 'CRITICAL',
            category: 'AUTHENTICATION_SECURITY',
            affectedComponent: 'Backend Database Layer',
            affectedEndpoint: file,
            symptoms: [
              `Direct variable interpolation or string concatenation detected in database query on line ${i + 1}`
            ],
            evidence: {
              description: `Unparameterized database query in ${file}:${i + 1}`,
              locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
            },
            reproductionSteps: [
              `Inspect database query on line ${i + 1} of ${file}`,
              'Attempt passing quotes or SQL fragments in input parameter'
            ],
            expectedBehavior: 'Database queries must use parameterized placeholders (e.g., $1, ?, :param) or an ORM/query builder',
            actualBehavior: 'Query string directly interpolates external variables, exposing the database to arbitrary SQL execution',
            rootCause: 'String interpolation in SQL queries bypasses database query planner escaping',
            confidenceLevel: 'HIGH',
            impact: 'Severe: An attacker can manipulate queries to extract confidential data, bypass authentication, or modify tables',
            recommendedCorrection: 'Replace string interpolation with parameterized queries: db.query("SELECT ... WHERE id = $1", [id])',
            regressionTestRequirements: ['Security test verifying all database queries use parameterized placeholders'],
            repairable: false
          });
        }
      }
    }

    return {
      ruleId: 'SEC-INJ-001',
      status: findings.length > 0 ? 'FAIL' : 'PASS',
      executionTimeMs: Date.now() - startTime,
      message:
        findings.length > 0
          ? `Found ${findings.length} unparameterized database query(ies) vulnerable to injection.`
          : 'All observable database queries use safe parameterization or ORM patterns.',
      findings
    };
  }
};
