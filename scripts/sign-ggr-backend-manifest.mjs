import { sign } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (!['--manifest', '--signature'].includes(argument)) throw new Error(`unknown argument ${argument}`)
    const value = argv[++index]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
    options[argument.slice(2)] = value
  }
  if (!options.manifest || !options.signature) throw new Error('--manifest and --signature are required')
  return options
}

const privateKey = process.env.GGR_UPDATE_PRIVATE_KEY
if (!privateKey) throw new Error('GGR_UPDATE_PRIVATE_KEY is required')

const options = parseArguments(process.argv.slice(2))
const manifest = await fs.readFile(options.manifest)
const signature = sign(null, manifest, privateKey).toString('base64')
await fs.mkdir(path.dirname(options.signature), { recursive: true })
await fs.writeFile(options.signature, `${signature}\n`, { mode: 0o600 })
