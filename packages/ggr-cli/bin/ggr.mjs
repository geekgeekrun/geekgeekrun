#!/usr/bin/env node
import { createCli } from '../lib/cli.mjs'

try {
  await createCli().run(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`ggr: ${error.message}\n`)
  process.exitCode = 1
}
