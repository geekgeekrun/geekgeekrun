import increasePackageVersion from './steps/increase-package-version.mjs'
import releaseVersion from './steps/release-version.mjs'
import prompt from 'prompt-sync'
;(async () => {
  const releaseType = prompt()(
    'Enter the release type (default: prerelease, available: prerelease / prepatch / patch / preminor / minor / premajor / major): '
  )
  await increasePackageVersion(releaseType || 'prerelease')
  await releaseVersion()
})()
