import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { NetworkTracer } from '../src/probe/network-tracer.js';

describe('NetworkTracer 15-Stage Lifecycle Probe', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/api/healthy') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'u_1', name: 'John Doe', role: 'admin' }));
      } else if (req.url === '/api/schema-drift') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'u_1' })); // missing expected 'role'
      } else if (req.url === '/api/unauthorized') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized token' }));
      } else if (req.url === '/api/crash') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database crash' }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('verifies all 15 stages on 200 OK healthy endpoint', async () => {
    const trace = await NetworkTracer.probeEndpoint(
      `http://localhost:${serverPort}/api/healthy`,
      'GET',
      { expectedSchemaFields: ['id', 'name', 'role'] }
    );

    expect(trace.statusCode).toBe(200);
    expect(trace.earliestFailureStage).toBeUndefined();
    expect(trace.findings.length).toBe(0);
    expect(trace.stages.every((s) => s.status === 'VERIFIED')).toBe(true);
  });

  it('classifies schema drift on 200 OK response', async () => {
    const trace = await NetworkTracer.probeEndpoint(
      `http://localhost:${serverPort}/api/schema-drift`,
      'GET',
      { expectedSchemaFields: ['id', 'role'] }
    );

    expect(trace.statusCode).toBe(200);
    expect(trace.findings.length).toBe(1);
    expect(trace.findings[0]?.ruleId).toBe('LIVE_PROBE_RESPONSE_SCHEMA_DRIFT');
  });

  it('classifies HTTP 404 at backend routing stage', async () => {
    const trace = await NetworkTracer.probeEndpoint(
      `http://localhost:${serverPort}/api/non-existent-route`
    );

    expect(trace.statusCode).toBe(404);
    expect(trace.earliestFailureStage).toBe('7_BACKEND_ROUTING_AND_MIDDLEWARE');
    expect(trace.failureClassification).toBe('BACKEND_ROUTE_FAILURE');
  });

  it('classifies HTTP 401 at authentication stage', async () => {
    const trace = await NetworkTracer.probeEndpoint(
      `http://localhost:${serverPort}/api/unauthorized`
    );

    expect(trace.statusCode).toBe(401);
    expect(trace.earliestFailureStage).toBe('8_AUTHENTICATION_AND_AUTHORIZATION');
    expect(trace.failureClassification).toBe('AUTHENTICATION_FAILURE');
  });

  it('classifies HTTP 500 at business logic stage', async () => {
    const trace = await NetworkTracer.probeEndpoint(
      `http://localhost:${serverPort}/api/crash`
    );

    expect(trace.statusCode).toBe(500);
    expect(trace.earliestFailureStage).toBe('10_BUSINESS_LOGIC');
    expect(trace.failureClassification).toBe('BUSINESS_LOGIC_FAILURE');
  });

  it('classifies TCP connection failure on unused port', async () => {
    const trace = await NetworkTracer.probeEndpoint(
      'http://127.0.0.1:54321/api/dead-server'
    );

    expect(trace.earliestFailureStage).toBe('5_NETWORK_REQUEST');
    expect(trace.failureClassification).toBe('DNS_OR_CONNECTION_FAILURE');
  });
});
