export function redactDiagnosticText(value) {
  const raw = typeof value === 'string' ? value : 'Backend operation failed'
  return raw
    .replace(/\bfile:\/\/(?:localhost\/)?[^\s"')<>;,]+/gi, '[redacted]')
    .replace(/(^|[^A-Za-z0-9_])\\\\(?:[^\\\s"')<>;,]+\\)+[^\\\s"')<>;,]*/g, '$1[redacted]')
    .replace(/(^|[^A-Za-z0-9_])[A-Za-z]:[\\/][^\s"')<>;,]*/g, '$1[redacted]')
    .replace(/(^|[^A-Za-z0-9._:/-])\/(?:[^\s"')<>;,]+(?:\/[^\s"')<>;,]+)*)/g, '$1[redacted]')
    .replace(/(?:token|password|secret|credential)\s*[:=]\s*\S+/gi, '[redacted]')
}
