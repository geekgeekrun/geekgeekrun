import increasePackageVersion from './steps/increase-package-version.mjs'
import releaseVersion from './steps/release-version.mjs'
import { select } from '@inquirer/prompts'

const releaseTypeList = [
  'prerelease',
  'prepatch',
  'patch',
  'preminor',
  'minor',
  'premajor',
  'major'
]
;(async () => {
  const releaseType = await select({
    message: 'Select the release type',
    default: releaseTypeList[0],
    choices: releaseTypeList.map((value) => ({
      name: value,
      value
    }))
  })
  await increasePackageVersion(releaseType || releaseTypeList[0])
  await releaseVersion()
})()
