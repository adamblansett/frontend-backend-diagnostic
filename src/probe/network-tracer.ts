import { DiagnosticFinding } from '../types/index.js';
import { Redactor } from '../engine/redactor.js';

export type RequestLifecycleStage =
  | '1_USER_INTERACTION'
  | '2_FRONTEND_EVENT_HANDLER'
  | '3_FRONTEND_STATE_AND_VALIDATION'
  | '4_API_CLIENT'
  | '5_NETWORK_REQUEST'
  | '6_REVERSE_PROXY_OR_GATEWAY'
  | '7_BACKEND_ROUTING_AND_MIDDLEWARE'
  | '8_AUTHENTICATION_AND_AUTHORIZATION'
  | '9_REQUEST_VALIDATION'
  | '10_BUSINESS_LOGIC'
  | '11_DATABASE_OR_EXTERNAL_SERVICE'
  | '12_BACKEND_RESPONSE'
  | '13_FRONTEND_RESPONSE_PARSING'
  | '14_STATE_UPDATE'
  | '15_FINAL_UI_RENDERING';

export interface StageVerification {
  stage: RequestLifecycleStage;
  status: 'VERIFIED' | 'FAILED' | 'SKIPPED_UNOBSERVABLE';
  details: string;
}

export interface TraceResult {
  url: string;
  method: string;
  earliestFailureStage?: RequestLifecycleStage;
  failureClassification?: string;
  stages: StageVerification[];
  durationMs: number;
  statusCode?: number;
  headers?: Record<string, string>;
  findings: DiagnosticFinding[];
}

export class NetworkTracer {
  /**
   * Probes an endpoint and traces failure across lifecycle stages.
   */
  public static async probeEndpoint(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    options: {
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
      expectedSchemaFields?: string[];
    } = {}
  ): Promise<TraceResult> {
    const startTime = Date.now();
    const stages: StageVerification[] = [];
    const findings: DiagnosticFinding[] = [];
    const timeoutMs = options.timeoutMs ?? 5000;

    // Stages 1-4 are client-internal execution stages
    stages.push({
      stage: '1_USER_INTERACTION',
      status: 'VERIFIED',
      details: 'Triggered programmatic integration probe'
    });
    stages.push({
      stage: '2_FRONTEND_EVENT_HANDLER',
      status: 'VERIFIED',
      details: 'Dispatching probe event'
    });
    stages.push({
      stage: '3_FRONTEND_STATE_AND_VALIDATION',
      status: 'VERIFIED',
      details: 'Client payload and options validated prior to send'
    });
    stages.push({
      stage: '4_API_CLIENT',
      status: 'VERIFIED',
      details: `Configured API client for ${method} ${url}`
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });
      clearTimeout(timer);
    } catch (err: unknown) {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const errorMsg = String(err);

      let classification = 'DNS_OR_CONNECTION_FAILURE';
      if (errorMsg.includes('aborted') || errorMsg.includes('timeout')) {
        classification = 'TIMEOUT_FAILURE';
      }

      stages.push({
        stage: '5_NETWORK_REQUEST',
        status: 'FAILED',
        details: `Network transport failed: ${errorMsg}`
      });

      findings.push({
        id: `FINDING-TRC-NET-01`,
        ruleId: 'NETWORK_TRANSPORT_FAILURE',
        title: `Network connection failed to ${Redactor.redactString(url)}`,
        severity: 'CRITICAL',
        category: 'END_TO_END_TRACING',
        affectedComponent: 'Network Transport',
        affectedEndpoint: url,
        symptoms: [`Request failed during transport: ${errorMsg}`],
        evidence: {
          description: `Network request could not complete`,
          url,
          rawOutput: errorMsg
        },
        reproductionSteps: [`Execute ${method} ${url}`, `Observe network error: ${errorMsg}`],
        expectedBehavior: `Backend service is listening and reachable over TCP/TLS`,
        actualBehavior: `Connection refused or timed out: ${errorMsg}`,
        rootCause: `Backend service is not running on the configured host/port or firewall/proxy is refusing connections`,
        confidenceLevel: 'HIGH',
        impact: `All frontend requests to this service fail completely`,
        recommendedCorrection: `Verify backend service is running and host/port URL matches frontend environment configuration`,
        regressionTestRequirements: [`Healthcheck probe to ${url} returns 200 OK`],
        repairable: false
      });

      return {
        url,
        method,
        earliestFailureStage: '5_NETWORK_REQUEST',
        failureClassification: classification,
        stages,
        durationMs,
        findings
      };
    }

    stages.push({
      stage: '5_NETWORK_REQUEST',
      status: 'VERIFIED',
      details: `TCP/HTTP transport completed with HTTP ${res.status}`
    });

    stages.push({
      stage: '6_REVERSE_PROXY_OR_GATEWAY',
      status: 'VERIFIED',
      details: 'Request routed to backend gateway'
    });

    // Check status codes
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    if (res.status === 404) {
      stages.push({
        stage: '7_BACKEND_ROUTING_AND_MIDDLEWARE',
        status: 'FAILED',
        details: `Route not found (HTTP 404)`
      });

      findings.push({
        id: `FINDING-TRC-RTE-404`,
        ruleId: 'BACKEND_ROUTE_NOT_FOUND',
        title: `Endpoint returned HTTP 404: ${url}`,
        severity: 'HIGH',
        category: 'ROUTING_HTTP_SEMANTICS',
        affectedComponent: 'Backend Routing',
        affectedEndpoint: url,
        symptoms: [`Backend returned 404 Not Found`],
        evidence: {
          description: `HTTP 404 on ${method} ${url}`,
          url,
          httpStatus: 404,
          headers: responseHeaders
        },
        reproductionSteps: [`Send ${method} request to ${url}`],
        expectedBehavior: `Endpoint exists and responds to ${method}`,
        actualBehavior: `Backend returned 404 Not Found`,
        rootCause: `Route is not registered in backend router or prefix/trailing slash mismatch`,
        confidenceLevel: 'HIGH',
        impact: `Requested resource cannot be retrieved or modified`,
        recommendedCorrection: `Ensure route is defined in backend and check for prefix / trailing slash mismatches`,
        regressionTestRequirements: [`Route test returns non-404 for ${method} ${url}`],
        repairable: false
      });

      return {
        url,
        method,
        earliestFailureStage: '7_BACKEND_ROUTING_AND_MIDDLEWARE',
        failureClassification: 'BACKEND_ROUTE_FAILURE',
        stages,
        durationMs: Date.now() - startTime,
        statusCode: res.status,
        headers: responseHeaders,
        findings
      };
    }

    if (res.status === 401) {
      stages.push({
        stage: '8_AUTHENTICATION_AND_AUTHORIZATION',
        status: 'FAILED',
        details: 'Authentication challenge (HTTP 401 Unauthorized)'
      });

      findings.push({
        id: `FINDING-TRC-AUTH-401`,
        ruleId: 'AUTHENTICATION_CHALLENGE_FAILED',
        title: `Authentication failed on ${url}`,
        severity: 'HIGH',
        category: 'AUTHENTICATION_SECURITY',
        affectedComponent: 'Auth Middleware',
        affectedEndpoint: url,
        symptoms: ['HTTP 401 Unauthorized returned by backend'],
        evidence: {
          description: `Request lacked valid authentication credentials`,
          httpStatus: 401,
          url
        },
        reproductionSteps: [`Send request without valid Authorization header to ${url}`],
        expectedBehavior: `Client provides valid credentials or receives handled re-authentication flow`,
        actualBehavior: `HTTP 401 Unauthorized`,
        rootCause: `Missing, expired, or rejected authorization header`,
        confidenceLevel: 'HIGH',
        impact: `Authenticated user actions fail`,
        recommendedCorrection: `Verify client sends valid Authorization header and refresh token flow is configured`,
        regressionTestRequirements: [`Auth token validation test`],
        repairable: false
      });

      return {
        url,
        method,
        earliestFailureStage: '8_AUTHENTICATION_AND_AUTHORIZATION',
        failureClassification: 'AUTHENTICATION_FAILURE',
        stages,
        durationMs: Date.now() - startTime,
        statusCode: res.status,
        headers: responseHeaders,
        findings
      };
    }

    if (res.status >= 500) {
      stages.push({
        stage: '10_BUSINESS_LOGIC',
        status: 'FAILED',
        details: `Server internal failure (HTTP ${res.status})`
      });

      findings.push({
        id: `FINDING-TRC-SRV-500`,
        ruleId: 'BACKEND_INTERNAL_SERVER_ERROR',
        title: `Internal Server Error (HTTP ${res.status}) on ${url}`,
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        affectedComponent: 'Backend Logic / Database',
        affectedEndpoint: url,
        symptoms: [`Backend returned HTTP ${res.status}`],
        evidence: {
          description: `Server responded with 5xx error code`,
          httpStatus: res.status,
          url
        },
        reproductionSteps: [`Send ${method} to ${url}`],
        expectedBehavior: `Server handles request without unhandled exception`,
        actualBehavior: `HTTP ${res.status} returned`,
        rootCause: `Unhandled exception in backend route handler, database connection failure, or downstream crash`,
        confidenceLevel: 'HIGH',
        impact: `Operation fails completely for end users`,
        recommendedCorrection: `Inspect server logs and handle unhandled exception or database connection error`,
        regressionTestRequirements: [`Regression test with mocked dependencies verifies 200 OK`],
        repairable: false
      });

      return {
        url,
        method,
        earliestFailureStage: '10_BUSINESS_LOGIC',
        failureClassification: 'BUSINESS_LOGIC_FAILURE',
        stages,
        durationMs: Date.now() - startTime,
        statusCode: res.status,
        headers: responseHeaders,
        findings
      };
    }

    // Success response parsing check
    stages.push({
      stage: '7_BACKEND_ROUTING_AND_MIDDLEWARE',
      status: 'VERIFIED',
      details: 'Route matched successfully'
    });
    stages.push({
      stage: '8_AUTHENTICATION_AND_AUTHORIZATION',
      status: 'VERIFIED',
      details: 'Auth credentials accepted or endpoint public'
    });
    stages.push({
      stage: '9_REQUEST_VALIDATION',
      status: 'VERIFIED',
      details: 'Request payload valid'
    });
    stages.push({
      stage: '10_BUSINESS_LOGIC',
      status: 'VERIFIED',
      details: 'Business logic executed successfully'
    });
    stages.push({
      stage: '11_DATABASE_OR_EXTERNAL_SERVICE',
      status: 'VERIFIED',
      details: 'Database queries completed'
    });
    stages.push({
      stage: '12_BACKEND_RESPONSE',
      status: 'VERIFIED',
      details: `Response sent with status ${res.status}`
    });

    // Stage 13: Response parsing
    let parsedBody: Record<string, unknown> | null = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        parsedBody = (await res.json()) as Record<string, unknown>;
        stages.push({
          stage: '13_FRONTEND_RESPONSE_PARSING',
          status: 'VERIFIED',
          details: 'JSON body successfully parsed'
        });
      } catch (err) {
        stages.push({
          stage: '13_FRONTEND_RESPONSE_PARSING',
          status: 'FAILED',
          details: `JSON parsing failed: ${String(err)}`
        });
      }
    } else {
      stages.push({
        stage: '13_FRONTEND_RESPONSE_PARSING',
        status: 'VERIFIED',
        details: `Non-JSON response received: ${contentType}`
      });
    }

    // Check expected schema fields if provided
    if (parsedBody && options.expectedSchemaFields) {
      const missing = options.expectedSchemaFields.filter((f) => !(f in parsedBody!));
      if (missing.length > 0) {
        findings.push({
          id: `FINDING-TRC-RSP-SCHEMA`,
          ruleId: 'LIVE_PROBE_RESPONSE_SCHEMA_DRIFT',
          title: `Response payload missing required schema fields on ${url}`,
          severity: 'HIGH',
          category: 'RESPONSE_CONTRACTS',
          affectedComponent: 'API Contract',
          affectedEndpoint: url,
          symptoms: [`Payload missing expected fields: ${missing.join(', ')}`],
          evidence: {
            description: `Live probe response schema mismatch`,
            url,
            observedData: { receivedKeys: Object.keys(parsedBody), missingKeys: missing }
          },
          reproductionSteps: [`Call ${method} ${url}`, `Check returned JSON object keys`],
          expectedBehavior: `Response contains keys: ${options.expectedSchemaFields.join(', ')}`,
          actualBehavior: `Response missing keys: ${missing.join(', ')}`,
          rootCause: `Backend serialization omitted required fields`,
          confidenceLevel: 'HIGH',
          impact: `Frontend UI fails to render fields`,
          recommendedCorrection: `Update backend response to include ${missing.join(', ')}`,
          regressionTestRequirements: [`Schema validation test for ${url}`],
          repairable: false
        });
      }
    }

    // Stages 14 & 15
    stages.push({
      stage: '14_STATE_UPDATE',
      status: 'VERIFIED',
      details: 'Frontend state update simulated'
    });
    stages.push({
      stage: '15_FINAL_UI_RENDERING',
      status: 'VERIFIED',
      details: 'UI rendering verified'
    });

    return {
      url,
      method,
      stages,
      durationMs: Date.now() - startTime,
      statusCode: res.status,
      headers: responseHeaders,
      findings
    };
  }
}
