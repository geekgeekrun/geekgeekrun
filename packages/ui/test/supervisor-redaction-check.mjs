import assert from 'node:assert/strict'

let redactDiagnosticText
try {
  ({ redactDiagnosticText } = await import('../src/main/backend/redaction.mjs'))
} catch (error) {
  assert.fail(`diagnostic redaction helper must exist: ${error.message}`)
}

const redacted = redactDiagnosticText('failed file:///tmp/ggrd/manifest.json at /private/var/folders/x and C:\\Users\\name\\token.txt')
assert.doesNotMatch(redacted, /file:|\/tmp\/|\/private\/|\/var\/|C:\\/i)
assert.match(redacted, /\[redacted\]/)
console.log('supervisor redaction check passed')
