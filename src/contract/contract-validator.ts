import * as fs from 'node:fs';
import { DiagnosticFinding } from '../types/index.js';

export interface RouteDefinition {
  method: string;
  path: string;
  sourceFile: string;
  line?: number;
  expectedResponseFields?: Record<string, string>; // fieldName -> expectedType
}

export interface ClientCallDefinition {
  method: string;
  urlOrPath: string;
  sourceFile: string;
  line?: number;
  consumedFields?: string[];
  expectedFieldTypes?: Record<string, string>;
}

export class ContractValidator {
  private static readonly BUILTIN_RESPONSE_PROPERTIES = new Set([
    'json',
    'text',
    'blob',
    'arraybuffer',
    'formdata',
    'clone',
    'then',
    'catch',
    'status',
    'statustext',
    'ok',
    'headers',
    'url',
    'type',
    'redirected',
    'body',
    'bodyused'
  ]);

  /**
   * Extracts routes from backend files (e.g. app.get('/api/users', ...), router.post(...)).
   */
  public static extractBackendRoutes(backendFiles: string[]): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    const routeRegex = /\b(?:app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;

    for (const file of backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        let match: RegExpExecArray | null;
        routeRegex.lastIndex = 0;
        while ((match = routeRegex.exec(line)) !== null) {
          const method = match[1]?.toUpperCase() ?? 'GET';
          const routePath = match[2] ?? '/';

          // Extract inline response structure if res.json({ ... }) exists nearby
          const nearbyContent = lines.slice(i, Math.min(lines.length, i + 25)).join('\n');
          const responseFields = this.extractResponseFields(nearbyContent);

          routes.push({
            method,
            path: routePath,
            sourceFile: file,
            line: i + 1,
            expectedResponseFields: responseFields
          });
        }
      }
    }
    return routes;
  }

  /**
   * Extracts API calls from frontend files (e.g. fetch('/api/users'), axios.get('/api/users')).
   */
  public static extractFrontendCalls(frontendFiles: string[]): ClientCallDefinition[] {
    const calls: ClientCallDefinition[] = [];
    const fetchRegex = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
    const axiosRegex = /axios\.(get|post|put|delete|patch)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;

    for (const file of frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Check fetch
        let match: RegExpExecArray | null;
        fetchRegex.lastIndex = 0;
        while ((match = fetchRegex.exec(line)) !== null) {
          const urlOrPath = match[1] ?? '';
          const nearbyLines = lines.slice(i, Math.min(lines.length, i + 15)).join('\n');
          const methodMatch = /method\s*:\s*['"`]([A-Z]+)['"`]/i.exec(nearbyLines);
          const method = methodMatch && methodMatch[1] ? methodMatch[1].toUpperCase() : 'GET';

          const consumedFields = this.extractConsumedFields(
            lines.slice(i, Math.min(lines.length, i + 25)).join('\n')
          );

          calls.push({
            method,
            urlOrPath,
            sourceFile: file,
            line: i + 1,
            consumedFields
          });
        }

        // Check axios
        axiosRegex.lastIndex = 0;
        while ((match = axiosRegex.exec(line)) !== null) {
          const method = match[1]?.toUpperCase() ?? 'GET';
          const urlOrPath = match[2] ?? '';
          const consumedFields = this.extractConsumedFields(
            lines.slice(i, Math.min(lines.length, i + 25)).join('\n')
          );

          calls.push({
            method,
            urlOrPath,
            sourceFile: file,
            line: i + 1,
            consumedFields
          });
        }
      }
    }
    return calls;
  }

  /**
   * Compares extracted frontend calls and backend routes, identifying contract mismatches.
   */
  public static compareContracts(
    clientCalls: ClientCallDefinition[],
    backendRoutes: RouteDefinition[]
  ): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    for (const call of clientCalls) {
      // Normalize path (strip host/port, collapse duplicate slashes, strip trailing slash)
      let normalizedCallPath = call.urlOrPath
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/\/+/g, '/');
      if (normalizedCallPath.length > 1 && normalizedCallPath.endsWith('/')) {
        normalizedCallPath = normalizedCallPath.slice(0, -1);
      }

      // Find matching backend route with matching method and path
      const matchingRoute = backendRoutes.find((r) => {
        let routePath = r.path.replace(/\/+/g, '/');
        if (routePath.length > 1 && routePath.endsWith('/')) {
          routePath = routePath.slice(0, -1);
        }
        return routePath === normalizedCallPath && r.method === call.method;
      });

      if (!matchingRoute) {
        // Check if path exists with different method
        const altMethodRoute = backendRoutes.find((r) => {
          let routePath = r.path.replace(/\/+/g, '/');
          if (routePath.length > 1 && routePath.endsWith('/')) {
            routePath = routePath.slice(0, -1);
          }
          return routePath === normalizedCallPath;
        });

        if (altMethodRoute) {
          findings.push({
            id: `FINDING-CON-MTH-${findings.length + 1}`,
            ruleId: 'API_CONTRACT_METHOD_MISMATCH',
            title: `HTTP method mismatch for endpoint ${normalizedCallPath}`,
            severity: 'HIGH',
            category: 'API_CONTRACT_VALIDATION',
            affectedComponent: 'API Contract',
            affectedEndpoint: normalizedCallPath,
            symptoms: [
              `Frontend calls ${call.method} ${normalizedCallPath}, but backend only listens for ${altMethodRoute.method}`
            ],
            evidence: {
              description: `Method discrepancy detected between client call and route definition`,
              locations: [
                { filePath: call.sourceFile, line: call.line },
                { filePath: altMethodRoute.sourceFile, line: altMethodRoute.line }
              ]
            },
            reproductionSteps: [
              `Initiate ${call.method} request to "${normalizedCallPath}" from client`,
              `Inspect HTTP status returned by backend`
            ],
            expectedBehavior: `Client and server agree on HTTP method ${altMethodRoute.method}`,
            actualBehavior: `Client requests ${call.method}, causing HTTP 404 or 405 Method Not Allowed`,
            rootCause: `Frontend API client was implemented with ${call.method} while backend route handles ${altMethodRoute.method}`,
            confidenceLevel: 'HIGH',
            impact: `API request will be rejected by backend, breaking the user workflow.`,
            recommendedCorrection: `Align HTTP method in ${call.sourceFile} or ${altMethodRoute.sourceFile}`,
            regressionTestRequirements: [
              `Verify integration test passes for ${altMethodRoute.method} ${normalizedCallPath}`
            ],
            repairable: false
          });
        }
        continue;
      }

      // Check response fields contract if both backend provides fields and frontend consumes fields
      if (
        matchingRoute.expectedResponseFields &&
        Object.keys(matchingRoute.expectedResponseFields).length > 0 &&
        call.consumedFields &&
        call.consumedFields.length > 0
      ) {
        const missingFields = call.consumedFields.filter(
          (field) => !(field in matchingRoute.expectedResponseFields!)
        );

        if (missingFields.length > 0) {
          findings.push({
            id: `FINDING-CON-FLD-${findings.length + 1}`,
            ruleId: 'API_CONTRACT_RESPONSE_FIELD_DRIFT',
            title: `Missing expected response fields on ${normalizedCallPath}`,
            severity: 'HIGH',
            category: 'RESPONSE_CONTRACTS',
            affectedComponent: 'API Response Contract',
            affectedEndpoint: normalizedCallPath,
            symptoms: [
              `Frontend attempts to access properties [${missingFields.join(', ')}] which are not returned by the backend response.`
            ],
            evidence: {
              description: `Frontend expects fields ${JSON.stringify(missingFields)} not present in backend route handler`,
              locations: [
                { filePath: call.sourceFile, line: call.line },
                { filePath: matchingRoute.sourceFile, line: matchingRoute.line }
              ],
              observedData: {
                frontendConsumed: call.consumedFields,
                backendProvided: Object.keys(matchingRoute.expectedResponseFields)
              }
            },
            reproductionSteps: [
              `Request ${matchingRoute.method} ${normalizedCallPath}`,
              `Inspect returned JSON payload`,
              `Observe missing keys: ${missingFields.join(', ')}`
            ],
            expectedBehavior: `Backend response contains all fields required by the frontend client: ${call.consumedFields.join(', ')}`,
            actualBehavior: `Backend returns payload missing fields: ${missingFields.join(', ')}, causing undefined errors in UI components`,
            rootCause: `Backend schema drifted or frontend model was updated without corresponding backend serialization updates`,
            confidenceLevel: 'HIGH',
            impact: `Frontend UI fails to display data, throws TypeError reading undefined property, or renders empty components`,
            recommendedCorrection: `Update backend route in ${matchingRoute.sourceFile} to include ${missingFields.join(', ')} in the response payload`,
            regressionTestRequirements: [
              `Add contract test verifying response schema for ${matchingRoute.method} ${normalizedCallPath}`
            ],
            repairable: false
          });
        }
      }
    }

    return findings;
  }

  private static extractResponseFields(codeSnippet: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const resJsonRegex = /res\.(?:json|send)\s*\(\s*\{([^}]+)\}/g;
    const match = resJsonRegex.exec(codeSnippet);
    if (match && match[1]) {
      const body = match[1];
      const pairs = body.split(',');
      for (const pair of pairs) {
        const parts = pair.split(':');
        const key = parts[0]?.trim();
        if (key && /^[a-zA-Z0-9_]+$/.test(key)) {
          fields[key] = 'unknown';
        }
      }
    }
    return fields;
  }

  private static extractConsumedFields(codeSnippet: string): string[] {
    const fields: string[] = [];
    const propRegex = /(?:data|user|item|res|response|u)\.([a-zA-Z0-9_]+)/g;
    let match: RegExpExecArray | null;
    while ((match = propRegex.exec(codeSnippet)) !== null) {
      const prop = match[1]?.toLowerCase();
      if (prop && !this.BUILTIN_RESPONSE_PROPERTIES.has(prop)) {
        fields.push(match[1]!);
      }
    }
    return Array.from(new Set(fields));
  }
}
