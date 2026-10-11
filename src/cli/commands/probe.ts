import { NetworkTracer } from '../../probe/network-tracer.js';

export interface ProbeCommandOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  expectedFields?: string[];
  timeoutMs?: number;
}

export async function runProbeCommand(options: ProbeCommandOptions): Promise<number> {
  console.log(`\nInitiating Live Request Trace to: ${options.url}`);
  console.log(`Method: ${options.method || 'GET'}`);

  const trace = await NetworkTracer.probeEndpoint(options.url, options.method || 'GET', {
    headers: options.headers,
    timeoutMs: options.timeoutMs,
    expectedSchemaFields: options.expectedFields
  });

  console.log('\n--- 15-STAGE LIFECYCLE TRACE ---');
  for (const st of trace.stages) {
    const symbol = st.status === 'VERIFIED' ? '✔' : st.status === 'FAILED' ? '✖' : '○';
    console.log(`${symbol} [${st.status}] Stage ${st.stage}: ${st.details}`);
  }

  if (trace.earliestFailureStage) {
    console.log(`\n❌ Earliest Failure Stage: ${trace.earliestFailureStage}`);
    console.log(`Classification: ${trace.failureClassification}`);
  } else {
    console.log('\n✅ All observable request lifecycle stages verified successfully.');
  }

  if (trace.findings.length > 0) {
    console.log('\nPROBE FINDINGS:');
    for (const f of trace.findings) {
      console.log(`- [${f.severity}] ${f.title}`);
      console.log(`  Root cause: ${f.rootCause}`);
      console.log(`  Fix: ${f.recommendedCorrection}`);
    }
    return 1;
  }

  return 0;
}
