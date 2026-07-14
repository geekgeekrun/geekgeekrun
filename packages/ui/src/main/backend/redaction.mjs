export function redactDiagnosticText(value) {
  const raw = typeof value === 'string' ? value : 'Backend operation failed'
  return raw
    .replace(/(?:https?|file):\/\/\S+/gi, '[redacted]')
    .replace(/(?:^|[\s"'(])(?:\/[^\s"')<>]+|[A-Za-z]:\\[^\s"')<>]+)/g, '$1[redacted]')
    .replace(/(?:token|password|secret|credential)\s*[:=]\s*\S+/gi, '[redacted]')
}
