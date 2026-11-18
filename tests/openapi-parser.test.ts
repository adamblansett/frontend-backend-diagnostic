import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { OpenApiParser } from '../src/contract/openapi-parser.js';
import { RouteDefinition, ClientCallDefinition } from '../src/contract/contract-validator.js';

describe('OpenApiParser', () => {
  let tmpDir: string;
  let openApiYamlPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-openapi-test-'));
    openApiYamlPath = path.join(tmpDir, 'openapi.yaml');

    const sampleYaml = `
openapi: 3.0.0
info:
  title: Sample API
  version: 1.0.0
paths:
  /api/v1/users:
    get:
      summary: Get users list
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  name:
                    type: string
    post:
      summary: Create user
      responses:
        '201':
          description: Created
`;
    fs.writeFileSync(openApiYamlPath, sampleYaml, 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('correctly parses OpenAPI endpoints and response schemas from YAML', () => {
    const endpoints = OpenApiParser.parseFile(openApiYamlPath);
    expect(endpoints.length).toBe(2);

    const getEndpoint = endpoints.find((e) => e.method === 'GET');
    expect(getEndpoint).toBeDefined();
    expect(getEndpoint?.path).toBe('/api/v1/users');
    expect(getEndpoint?.responseProperties).toHaveProperty('id');
    expect(getEndpoint?.responseProperties).toHaveProperty('name');
  });

  it('detects method drift when client uses wrong HTTP method against OpenAPI spec', () => {
    const clientCalls: ClientCallDefinition[] = [
      {
        method: 'PUT', // OpenAPI only has GET and POST
        urlOrPath: '/api/v1/users',
        sourceFile: 'client.ts',
        line: 10
      }
    ];

    const findings = OpenApiParser.validateAgainstOpenApi([openApiYamlPath], clientCalls, []);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.ruleId).toBe('OPENAPI_METHOD_DRIFT');
  });

  it('detects schema property drift when frontend consumes undocumented fields', () => {
    const clientCalls: ClientCallDefinition[] = [
      {
        method: 'GET',
        urlOrPath: '/api/v1/users',
        sourceFile: 'client.ts',
        line: 12,
        consumedFields: ['id', 'name', 'billingAddress'] // billingAddress is not in openapi spec
      }
    ];

    const findings = OpenApiParser.validateAgainstOpenApi([openApiYamlPath], clientCalls, []);
    expect(findings.some((f) => f.ruleId === 'OPENAPI_RESPONSE_FIELD_DRIFT')).toBe(true);
    const driftFinding = findings.find((f) => f.ruleId === 'OPENAPI_RESPONSE_FIELD_DRIFT');
    expect(driftFinding?.symptoms[0]).toContain('billingAddress');
  });

  it('detects undocumented backend routes missing from OpenAPI documentation', () => {
    const backendRoutes: RouteDefinition[] = [
      {
        method: 'GET',
        path: '/api/v1/secret-admin', // Not in openapi spec
        sourceFile: 'admin.ts',
        line: 5
      }
    ];

    const findings = OpenApiParser.validateAgainstOpenApi([openApiYamlPath], [], backendRoutes);
    expect(findings.some((f) => f.ruleId === 'OPENAPI_UNDOCUMENTED_ROUTE')).toBe(true);
  });
});
