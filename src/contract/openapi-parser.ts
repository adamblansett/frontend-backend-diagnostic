import * as fs from 'node:fs';
import * as yaml from 'yaml';
import { DiagnosticFinding } from '../types/index.js';
import { ClientCallDefinition, RouteDefinition } from './contract-validator.js';

export interface OpenApiEndpoint {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  responseProperties?: Record<string, string>;
  expectedStatusCodes?: number[];
}

export class OpenApiParser {
  /**
   * Parses OpenAPI / Swagger file (JSON or YAML) and returns extracted endpoints.
   */
  public static parseFile(filePath: string): OpenApiEndpoint[] {
    if (!fs.existsSync(filePath)) return [];
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      let doc: any;
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        doc = yaml.parse(raw);
      } else {
        doc = JSON.parse(raw);
      }

      if (!doc || !doc.paths || typeof doc.paths !== 'object') {
        return [];
      }

      const endpoints: OpenApiEndpoint[] = [];
      for (const [routePath, methodsObj] of Object.entries(doc.paths)) {
        if (!methodsObj || typeof methodsObj !== 'object') continue;

        for (const [methodRaw, opObj] of Object.entries(methodsObj as Record<string, any>)) {
          const method = methodRaw.toUpperCase();
          if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(method)) {
            continue;
          }

          const responseProperties: Record<string, string> = {};
          const expectedStatusCodes: number[] = [];

          if (opObj.responses && typeof opObj.responses === 'object') {
            for (const [codeStr, respObj] of Object.entries(opObj.responses as Record<string, any>)) {
              const code = parseInt(codeStr, 10);
              if (!isNaN(code)) expectedStatusCodes.push(code);

              // OpenAPI 3.0+ structure: content['application/json'].schema.properties
              const schema = respObj?.content?.['application/json']?.schema || respObj?.schema;
              if (schema?.properties && typeof schema.properties === 'object') {
                for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
                  responseProperties[propName] = propDef?.type || 'unknown';
                }
              }
            }
          }

          endpoints.push({
            path: routePath,
            method,
            operationId: opObj.operationId,
            summary: opObj.summary,
            parameters: Array.isArray(opObj.parameters) ? opObj.parameters : undefined,
            responseProperties: Object.keys(responseProperties).length > 0 ? responseProperties : undefined,
            expectedStatusCodes: expectedStatusCodes.length > 0 ? expectedStatusCodes : undefined
          });
        }
      }
      return endpoints;
    } catch {
      return [];
    }
  }

  /**
   * Validates client calls and backend routes against OpenAPI endpoints.
   */
  public static validateAgainstOpenApi(
    openApiFiles: string[],
    clientCalls: ClientCallDefinition[],
    backendRoutes: RouteDefinition[]
  ): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];
    const openApiEndpoints: { specFile: string; endpoint: OpenApiEndpoint }[] = [];

    for (const specFile of openApiFiles) {
      const endpoints = this.parseFile(specFile);
      for (const ep of endpoints) {
        openApiEndpoints.push({ specFile, endpoint: ep });
      }
    }

    if (openApiEndpoints.length === 0) return findings;

    // Helper: Normalize path to parameterized form /users/:param
    const normalizeToParam = (p: string): string => {
      return p
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/\/+/g, '/')
        .replace(/\/$/, '')
        .replace(/\{[^}]+\}/g, ':param')
        .replace(/:[a-zA-Z0-9_]+/g, ':param')
        .replace(/\$\{[^}]+\}/g, ':param');
    };

    // 1. Verify frontend calls match an OpenAPI specification endpoint
    for (const call of clientCalls) {
      const normCall = normalizeToParam(call.urlOrPath);
      const match = openApiEndpoints.find(
        (o) => normalizeToParam(o.endpoint.path) === normCall && o.endpoint.method === call.method
      );

      if (!match) {
        const methodDrift = openApiEndpoints.find(
          (o) => normalizeToParam(o.endpoint.path) === normCall
        );

        if (methodDrift) {
          findings.push({
            id: `FINDING-OAS-MTH-${findings.length + 1}`,
            ruleId: 'OPENAPI_METHOD_DRIFT',
            title: `Client uses ${call.method} but OpenAPI spec defines ${methodDrift.endpoint.method} on ${call.urlOrPath}`,
            severity: 'HIGH',
            category: 'API_CONTRACT_VALIDATION',
            affectedComponent: 'OpenAPI Contract',
            affectedEndpoint: call.urlOrPath,
            symptoms: [
              `Frontend calls ${call.method} ${call.urlOrPath}, but OpenAPI specification "${methodDrift.specFile}" documents ${methodDrift.endpoint.method}`
            ],
            evidence: {
              description: 'Method discrepancy against OpenAPI spec',
              locations: [{ filePath: call.sourceFile, line: call.line }]
            },
            reproductionSteps: [
              `Inspect OpenAPI specification in ${methodDrift.specFile}`,
              `Observe endpoint ${methodDrift.endpoint.path} accepts only ${methodDrift.endpoint.method}`
            ],
            expectedBehavior: `Frontend client adheres to documented OpenAPI method ${methodDrift.endpoint.method}`,
            actualBehavior: `Client invokes ${call.method}`,
            rootCause: 'Frontend API client invocation drifted from formal OpenAPI specification',
            confidenceLevel: 'HIGH',
            impact: 'Requests fail schema validation or receive HTTP 405 Method Not Allowed in production gateways',
            recommendedCorrection: `Update ${call.sourceFile} to use ${methodDrift.endpoint.method} or update OpenAPI specification`,
            regressionTestRequirements: ['Contract test validating client against OpenAPI spec'],
            repairable: false
          });
        }
      } else if (match.endpoint.responseProperties && call.consumedFields && call.consumedFields.length > 0) {
        const missingInSpec = call.consumedFields.filter(
          (field) => !(field in match.endpoint.responseProperties!)
        );
        if (missingInSpec.length > 0) {
          findings.push({
            id: `FINDING-OAS-FLD-${findings.length + 1}`,
            ruleId: 'OPENAPI_RESPONSE_FIELD_DRIFT',
            title: `Frontend consumes fields [${missingInSpec.join(', ')}] not defined in OpenAPI response for ${match.endpoint.path}`,
            severity: 'MEDIUM',
            category: 'RESPONSE_CONTRACTS',
            affectedComponent: 'OpenAPI Response Schema',
            affectedEndpoint: match.endpoint.path,
            symptoms: [
              `Frontend relies on properties ${JSON.stringify(missingInSpec)} that are not documented in the official OpenAPI schema`
            ],
            evidence: {
              description: 'Schema property drift against OpenAPI document',
              locations: [{ filePath: call.sourceFile, line: call.line }],
              observedData: {
                frontendFields: call.consumedFields,
                documentedProperties: Object.keys(match.endpoint.responseProperties)
              }
            },
            reproductionSteps: [
              `Inspect schema for ${match.endpoint.method} ${match.endpoint.path} in ${match.specFile}`,
              `Observe missing property definitions: ${missingInSpec.join(', ')}`
            ],
            expectedBehavior: 'All fields consumed by client are documented in OpenAPI response schema',
            actualBehavior: `OpenAPI schema omits properties: ${missingInSpec.join(', ')}`,
            rootCause: 'Contract drift between frontend model and OpenAPI documentation',
            confidenceLevel: 'HIGH',
            impact: 'Generated SDKs and client models may drop or fail validation on undocumented fields',
            recommendedCorrection: `Update ${match.specFile} to document ${missingInSpec.join(', ')} in the response schema`,
            regressionTestRequirements: ['Validate API payload matches OpenAPI schema'],
            repairable: false
          });
        }
      }
    }

    // 2. Check if backend routes are missing from OpenAPI specification
    for (const route of backendRoutes) {
      if (route.path === '/health' || route.path === '/healthz' || route.path === '/status') {
        continue;
      }
      const normRoute = normalizeToParam(route.path);
      const isDocumented = openApiEndpoints.some(
        (o) => normalizeToParam(o.endpoint.path) === normRoute && o.endpoint.method === route.method
      );

      if (!isDocumented) {
        findings.push({
          id: `FINDING-OAS-UNDOC-${findings.length + 1}`,
          ruleId: 'OPENAPI_UNDOCUMENTED_ROUTE',
          title: `Backend route ${route.method} ${route.path} is not documented in OpenAPI specification`,
          severity: 'INFORMATIONAL',
          category: 'API_CONTRACT_VALIDATION',
          affectedComponent: 'OpenAPI Documentation',
          affectedEndpoint: route.path,
          symptoms: [`Backend implements route ${route.method} ${route.path} but it is missing from OpenAPI specs`],
          evidence: {
            description: 'Route not present in OpenAPI paths',
            locations: [{ filePath: route.sourceFile, line: route.line }]
          },
          reproductionSteps: [`Inspect OpenAPI specification files`, `Search for route ${route.path}`],
          expectedBehavior: 'All production backend routes should be documented in OpenAPI',
          actualBehavior: `Route ${route.path} is absent from OpenAPI documentation`,
          rootCause: 'Backend route added without updating OpenAPI document',
          confidenceLevel: 'HIGH',
          impact: 'API consumers and contract tests lack visibility into this route',
          recommendedCorrection: `Add ${route.method} ${route.path} to OpenAPI specification`,
          regressionTestRequirements: ['Verify OpenAPI schema includes all registered backend routes'],
          repairable: false
        });
      }
    }

    return findings;
  }
}
