import * as fs from 'node:fs';
import ts from 'typescript';
import { DiagnosticFinding } from '../types/index.js';
import { OpenApiParser } from './openapi-parser.js';

export interface RouteDefinition {
  method: string;
  path: string;
  sourceFile: string;
  line?: number;
  expectedResponseFields?: Record<string, string>; // fieldName -> expectedType
  pathParams?: string[];
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
    'bodyused',
    'method',
    'signal',
    'mode',
    'credentials',
    'cache',
    'redirect',
    'referrer',
    'referrerpolicy',
    'integrity',
    'keepalive'
  ]);

  /**
   * Normalizes a route or call path to a pattern regex for dynamic matching:
   * e.g. /api/users/:id or /api/users/{id} or /api/users/[id] -> ^/api/users/([^/]+)$
   */
  public static pathToRegex(routePath: string): RegExp {
    const cleanPath = routePath
      .replace(/^https?:\/\/[^/]+/i, '')
      .split('?')[0]!
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');

    const pattern = cleanPath
      .replace(/\{[^}]+\}/g, '([^/]+)')
      .replace(/\[[^\]]+\]/g, '([^/]+)')
      .replace(/:[a-zA-Z0-9_]+/g, '([^/]+)')
      .replace(/\$\{[^}]+\}/g, '([^/]+)');

    return new RegExp(`^${pattern}$`, 'i');
  }

  /**
   * Normalizes a client path containing literal values or template placeholders into a standardized path:
   */
  public static normalizePath(rawPath: string): string {
    return rawPath
      .replace(/^https?:\/\/[^/]+/i, '')
      .split('?')[0]!
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .replace(/\$\{[^}]+\}/g, ':param')
      .replace(/\{[^}]+\}/g, ':param')
      .replace(/\[[^\]]+\]/g, ':param');
  }

  /**
   * Checks if a client call path matches a backend route definition path.
   */
  public static pathsMatch(clientPath: string, routePath: string): boolean {
    const normClient = this.normalizePath(clientPath);
    const normRoute = this.normalizePath(routePath);

    if (normClient === normRoute) return true;

    // Test with regex conversion
    const routeRegex = this.pathToRegex(routePath);
    const cleanClient = clientPath.replace(/^https?:\/\/[^/]+/i, '').split('?')[0]!.replace(/\/+/g, '/').replace(/\/$/, '');
    if (routeRegex.test(cleanClient)) return true;

    const clientRegex = this.pathToRegex(clientPath);
    const cleanRoute = routePath.replace(/^https?:\/\/[^/]+/i, '').split('?')[0]!.replace(/\/+/g, '/').replace(/\/$/, '');
    if (clientRegex.test(cleanRoute)) return true;

    return false;
  }

  /**
   * Extracts routes from backend files using AST traversal and regex fallbacks.
   */
  public static extractBackendRoutes(backendFiles: string[]): RouteDefinition[] {
    const routes: RouteDefinition[] = [];

    for (const file of backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      try {
        const sourceFile = ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          true
        );

        this.extractRoutesFromAST(sourceFile, file, routes);
      } catch {
        this.extractRoutesRegexFallback(content, file, routes);
      }
    }
    return routes;
  }

  private static extractRoutesFromAST(
    sourceFile: ts.SourceFile,
    filePath: string,
    routes: RouteDefinition[]
  ): void {
    const httpMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        let methodName: string | undefined;
        let isRouteCall = false;

        // Pattern: app.get('/...', ...), router.post('/...', ...)
        if (ts.isPropertyAccessExpression(node.expression)) {
          const prop = node.expression.name.text.toLowerCase();
          if (httpMethods.has(prop)) {
            methodName = prop.toUpperCase();
            isRouteCall = true;
          }
        }

        if (isRouteCall && methodName && node.arguments.length > 0) {
          const firstArg = node.arguments[0]!;
          let routePath: string | undefined;

          if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
            routePath = firstArg.text;
          } else if (ts.isTemplateExpression(firstArg)) {
            routePath = this.templateExpressionToString(firstArg, sourceFile);
          }

          if (routePath) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            const responseFields = this.extractResponseFieldsFromNode(node, sourceFile);

            routes.push({
              method: methodName,
              path: routePath,
              sourceFile: filePath,
              line,
              expectedResponseFields: responseFields
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private static extractRoutesRegexFallback(content: string, filePath: string, routes: RouteDefinition[]): void {
    const routeRegex = /\b(?:app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let match: RegExpExecArray | null;
      routeRegex.lastIndex = 0;
      while ((match = routeRegex.exec(line)) !== null) {
        const method = match[1]?.toUpperCase() ?? 'GET';
        const routePath = match[2] ?? '/';
        const nearbyContent = lines.slice(i, Math.min(lines.length, i + 25)).join('\n');
        const responseFields = this.extractResponseFields(nearbyContent);

        routes.push({
          method,
          path: routePath,
          sourceFile: filePath,
          line: i + 1,
          expectedResponseFields: responseFields
        });
      }
    }
  }

  /**
   * Extracts API calls from frontend files using AST traversal and regex fallbacks.
   */
  public static extractFrontendCalls(frontendFiles: string[]): ClientCallDefinition[] {
    const calls: ClientCallDefinition[] = [];

    for (const file of frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      try {
        const sourceFile = ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          true
        );
        this.extractCallsFromAST(sourceFile, file, calls);
      } catch {
        this.extractCallsRegexFallback(content, file, calls);
      }
    }
    return calls;
  }

  private static extractCallsFromAST(
    sourceFile: ts.SourceFile,
    filePath: string,
    calls: ClientCallDefinition[]
  ): void {
    const axiosMethods = new Set(['get', 'post', 'put', 'delete', 'patch']);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        let isFetch = false;
        let isAxios = false;
        let method = 'GET';
        let urlArg: ts.Expression | undefined;

        if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
          isFetch = true;
          urlArg = node.arguments[0];
          if (node.arguments.length > 1 && ts.isObjectLiteralExpression(node.arguments[1]!)) {
            for (const prop of node.arguments[1]!.properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                ts.isIdentifier(prop.name) &&
                prop.name.text.toLowerCase() === 'method' &&
                ts.isStringLiteral(prop.initializer)
              ) {
                method = prop.initializer.text.toUpperCase();
              }
            }
          }
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          const propName = node.expression.name.text.toLowerCase();
          const objText = node.expression.expression.getText(sourceFile).toLowerCase();
          if (objText.includes('axios') || objText.includes('api') || objText.includes('client')) {
            if (axiosMethods.has(propName)) {
              isAxios = true;
              method = propName.toUpperCase();
              urlArg = node.arguments[0];
            }
          }
        }

        if ((isFetch || isAxios) && urlArg) {
          let urlOrPath: string | undefined;
          if (ts.isStringLiteral(urlArg) || ts.isNoSubstitutionTemplateLiteral(urlArg)) {
            urlOrPath = urlArg.text;
          } else if (ts.isTemplateExpression(urlArg)) {
            urlOrPath = this.templateExpressionToString(urlArg, sourceFile);
          }

          if (urlOrPath) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            const consumedFields = this.findConsumedFieldsInScope(node, sourceFile);

            calls.push({
              method,
              urlOrPath,
              sourceFile: filePath,
              line,
              consumedFields
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private static templateExpressionToString(expr: ts.TemplateExpression, _sf: ts.SourceFile): string {
    let result = expr.head.text;
    for (const span of expr.templateSpans) {
      result += ':param' + span.literal.text;
    }
    return result;
  }

  private static findConsumedFieldsInScope(callNode: ts.Node, sourceFile: ts.SourceFile): string[] {
    const fields: Set<string> = new Set();

    // Look at surrounding function block or statement
    let current: ts.Node = callNode;
    while (current.parent && !ts.isFunctionDeclaration(current) && !ts.isArrowFunction(current) && !ts.isMethodDeclaration(current) && !ts.isSourceFile(current)) {
      current = current.parent;
    }

    const checkNode = (node: ts.Node) => {
      // Never inspect the fetch/axios call itself or its arguments (e.g. { method: 'POST', body: ... })
      if (node === callNode) {
        return;
      }

      // 1. Destructuring: const { id, name, email } = await res.json()
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
        for (const el of node.name.elements) {
          if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
            const name = el.name.text;
            if (!this.BUILTIN_RESPONSE_PROPERTIES.has(name.toLowerCase())) {
              fields.add(name);
            }
          }
        }
      }

      // 2. Member accesses: user.name, item.email, data.id
      if (ts.isPropertyAccessExpression(node)) {
        const propName = node.name.text;
        const objText = node.expression.getText(sourceFile).toLowerCase();
        if (
          (objText === 'user' || objText === 'u' || objText === 'item' || objText === 'data' || objText === 'res' || objText === 'response') &&
          !this.BUILTIN_RESPONSE_PROPERTIES.has(propName.toLowerCase())
        ) {
          fields.add(propName);
        }
      }

      // 3. Object literal mapping: { id: user.id, name: user.name }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        const propName = node.name.text;
        const initText = node.initializer.getText(sourceFile).toLowerCase();
        if (
          (initText.includes('user.') || initText.includes('u.') || initText.includes('item.') || initText.includes('data.')) &&
          !this.BUILTIN_RESPONSE_PROPERTIES.has(propName.toLowerCase())
        ) {
          fields.add(propName);
        }
      }

      ts.forEachChild(node, checkNode);
    };

    checkNode(current);
    return Array.from(fields);
  }

  private static extractResponseFieldsFromNode(callNode: ts.Node, _sourceFile: ts.SourceFile): Record<string, string> {
    const fields: Record<string, string> = {};

    let current: ts.Node = callNode;
    while (current.parent && !ts.isFunctionDeclaration(current) && !ts.isArrowFunction(current) && !ts.isMethodDeclaration(current) && !ts.isSourceFile(current)) {
      current = current.parent;
    }

    const checkNode = (node: ts.Node) => {
      // Detect res.json({ id: ..., name: ... })
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const prop = node.expression.name.text.toLowerCase();
        if ((prop === 'json' || prop === 'send') && node.arguments.length > 0) {
          const arg = node.arguments[0]!;
          if (ts.isObjectLiteralExpression(arg)) {
            for (const propEl of arg.properties) {
              if (ts.isPropertyAssignment(propEl) && (ts.isIdentifier(propEl.name) || ts.isStringLiteral(propEl.name))) {
                fields[propEl.name.text] = 'unknown';
              }
            }
          }
        }
      }
      ts.forEachChild(node, checkNode);
    };

    checkNode(current);
    return fields;
  }

  private static extractCallsRegexFallback(content: string, filePath: string, calls: ClientCallDefinition[]): void {
    const fetchRegex = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
    const axiosRegex = /axios\.(get|post|put|delete|patch)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      let match: RegExpExecArray | null;
      fetchRegex.lastIndex = 0;
      while ((match = fetchRegex.exec(line)) !== null) {
        const urlOrPath = match[1] ?? '';
        const nearbyLines = lines.slice(i, Math.min(lines.length, i + 15)).join('\n');
        const methodMatch = /method\s*:\s*['"`]([A-Z]+)['"`]/i.exec(nearbyLines);
        const method = methodMatch && methodMatch[1] ? methodMatch[1].toUpperCase() : 'GET';
        const consumedFields = this.extractConsumedFields(lines.slice(i, Math.min(lines.length, i + 25)).join('\n'));

        calls.push({
          method,
          urlOrPath,
          sourceFile: filePath,
          line: i + 1,
          consumedFields
        });
      }

      axiosRegex.lastIndex = 0;
      while ((match = axiosRegex.exec(line)) !== null) {
        const method = match[1]?.toUpperCase() ?? 'GET';
        const urlOrPath = match[2] ?? '';
        const consumedFields = this.extractConsumedFields(lines.slice(i, Math.min(lines.length, i + 25)).join('\n'));

        calls.push({
          method,
          urlOrPath,
          sourceFile: filePath,
          line: i + 1,
          consumedFields
        });
      }
    }
  }

  /**
   * Compares extracted frontend calls and backend routes, identifying contract mismatches.
   */
  public static compareContracts(
    clientCalls: ClientCallDefinition[],
    backendRoutes: RouteDefinition[],
    openApiFiles: string[] = []
  ): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    // First validate against OpenAPI specifications if available
    if (openApiFiles.length > 0) {
      const openApiFindings = OpenApiParser.validateAgainstOpenApi(openApiFiles, clientCalls, backendRoutes);
      findings.push(...openApiFindings);
    }

    for (const call of clientCalls) {
      const normalizedCallPath = this.normalizePath(call.urlOrPath);

      // Find matching backend route with matching method and path
      const matchingRoute = backendRoutes.find((r) => {
        return this.pathsMatch(call.urlOrPath, r.path) && r.method === call.method;
      });

      if (!matchingRoute) {
        // Check if path exists with different method
        const altMethodRoute = backendRoutes.find((r) => {
          return this.pathsMatch(call.urlOrPath, r.path);
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
              `Frontend calls ${call.method} ${call.urlOrPath}, but backend only listens for ${altMethodRoute.method}`
            ],
            evidence: {
              description: `Method discrepancy detected between client call and route definition`,
              locations: [
                { filePath: call.sourceFile, line: call.line },
                { filePath: altMethodRoute.sourceFile, line: altMethodRoute.line }
              ]
            },
            reproductionSteps: [
              `Initiate ${call.method} request to "${call.urlOrPath}" from client`,
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
