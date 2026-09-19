import type { Json } from './model';

const bounded = (value: string, limit = 8192) => value.length > limit ? `${value.slice(0, limit)}\n[diagnostic truncated]` : value;
const privateKey = /cookie|authorization|credential|password|secret|signature|token|nonce|api[_-]?key|^headers$/i;

/** Diagnostics preserve resource identity, never signed queries or credentials. */
export function redactDiagnostic(text: string): string {
  return bounded(text.replace(/https?:\/\/[^\s"'<>\\]+/g, value => {
    try { const url = new URL(value); const part = url.searchParams.get('p'); return url.origin + url.pathname + (part && /^[1-9]\d*$/.test(part) ? `?p=${part}` : ''); }
    catch { return '[resource URL]'; }
  }).replace(/\b(authorization|cookie|set-cookie|(?:access|refresh)[_-]?token|password|secret)\s*[:=]\s*[^\n]+/gi, '$1: [redacted]'));
}

export function diagnosticContext(input: unknown, depth = 0): Json {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return bounded(redactDiagnostic(input), 2048);
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return Number.isFinite(input) ? input : String(input);
  if (typeof input === 'bigint') return String(input);
  if (depth >= 6) return '[context depth limit]';
  if (Array.isArray(input)) return input.slice(0, 64).map(value => diagnosticContext(value, depth + 1));
  if (typeof input === 'object') return Object.fromEntries(Object.entries(input).slice(0, 64).map(([key, value]) => [key, privateKey.test(key) ? '[redacted]' : diagnosticContext(value, depth + 1)]));
  return String(input);
}

export function diagnosticReport(message: string, context?: Record<string, unknown>) {
  return bounded([redactDiagnostic(message), context && Object.keys(context).length ? `context:\n${JSON.stringify(diagnosticContext(context), null, 2)}` : ''].filter(Boolean).join('\n\n'));
}

export function diagnosticError(code: string, stage: string, message: string, context: Record<string, unknown> = {}, cause?: unknown): Error {
  const detail = [`${code}: ${message}`, `stage: ${stage}`, `context:\n${JSON.stringify(diagnosticContext(context), null, 2)}`];
  if (cause !== undefined) {
    detail.push(`cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`);
    // Preserve useful frames once, rather than repeating a multiline message
    // inside every wrapped stack. The browser runtime supplies these frames.
    if (cause instanceof Error && cause.stack) {
      const prefix = `${cause.name}: ${cause.message}`;
      const frames = cause.stack.startsWith(prefix) ? cause.stack.slice(prefix.length) : cause.stack.slice(cause.stack.indexOf('\n') + 1);
      detail.push(`stack:\n${frames.split('\n').filter(line => /^\s*at /.test(line)).slice(0, 8).join('\n')}`);
    }
  }
  const error = new Error(redactDiagnostic(detail.join('\n')), { cause });
  error.name = 'CaptureDiagnosticError';
  return error;
}
