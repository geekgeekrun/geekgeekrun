import build from './steps/build.mjs'
import increasePackageVersion from './steps/increase-package-version.mjs'
import releaseVersion from './steps/release-version.mjs'
;(async () => {
  await increasePackageVersion()
  await build()
  await releaseVersion()
})()
