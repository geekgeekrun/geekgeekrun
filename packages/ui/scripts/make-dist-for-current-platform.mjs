import builder from 'electron-builder'
import yaml from 'js-yaml'
import url from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { buildTargetListMapByPlatform, osPlatformToBuildCommandMap } from './vars/os.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const getBuilderConfig = () => {
  return yaml.load(fs.readFileSync(path.join(__dirname, '../electron-builder.yml'), 'utf8'))
}

const main = async () => {
  const buildTargets = buildTargetListMapByPlatform[process.platform]
  const platformKeyForBuildParameter = osPlatformToBuildCommandMap[process.platform]
  if (!buildTargets?.length || !platformKeyForBuildParameter) {
    console.log('Cannot build for current platform')
    process.exit(1)
  }
  const buildParameter = {
    config: getBuilderConfig()
  }
  buildParameter[platformKeyForBuildParameter] = buildTargets.map((it) => `${it}:${process.arch}`)

  return await builder.build(buildParameter)
}

main()
