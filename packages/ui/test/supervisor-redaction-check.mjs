import assert from 'node:assert/strict'

let redactDiagnosticText
try {
  ({ redactDiagnosticText } = await import('../src/main/backend/redaction.mjs'))
} catch (error) {
  assert.fail(`diagnostic redaction helper must exist: ${error.message}`)
}

const redacted = redactDiagnosticText('failed path=/tmp/ggrd/manifest.json;file:///private/var/folders/x drive=C:\\Users\\name\\token.txt unc=\\\\server\\share\\secret.txt')
assert.doesNotMatch(redacted, /file:|\/tmp\/|\/private\/|\/var\/|C:\\|\\\\server/i)
assert.match(redacted, /\[redacted\]/)
assert.equal(redactDiagnosticText('Read https://example.test/docs?topic=paths and task=normal'), 'Read https://example.test/docs?topic=paths and task=normal', 'unrelated URLs and ordinary text remain readable')
console.log('supervisor redaction check passed')
