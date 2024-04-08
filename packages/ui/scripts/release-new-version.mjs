import buildUiOnCurrentPlatform from './steps/build-ui-on-current-platform.mjs';
import increasePackageVersion from './steps/increase-package-version.mjs'
import releaseVersion from './steps/release-version.mjs'
;(async () => {
  await increasePackageVersion()
  await buildUiOnCurrentPlatform()
  await releaseVersion()
})()
