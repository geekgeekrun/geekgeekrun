import semver from 'semver'
import packageJson from '../../../package.json'
import os from 'node:os'
import gtag from '../utils/gtag'
import { NewReleaseInfo } from '../../common/types/update'

export const currentOsPlatform = os.platform()
const RELEASE_LIST_URL = `https://api.github.com/repos/geekgeekrun/geekgeekrun/releases`

export interface GitHubReleaseItem {
  tag_name: string
  prerelease: boolean
  draft: boolean
  html_url: string
  body: string
  assets: Array<{
    browser_download_url: string
    name: string
  }>
}

// find by arch, appendix
function findTargetAsset(
  assets: GitHubReleaseItem['assets']
): null | GitHubReleaseItem['assets'][number] {
  let assetsFilteredByPlatform: GitHubReleaseItem['assets'] = []
  switch (os.platform()) {
    case 'win32': {
      assetsFilteredByPlatform = assets.filter((it) => it.name.endsWith('.exe'))
      break
    }
    case 'darwin': {
      assetsFilteredByPlatform = assets.filter((it) => it.name.endsWith('.dmg'))
      break
    }
    case 'linux': {
      assetsFilteredByPlatform = assets.filter((it) => it.name.endsWith('.deb'))
      break
    }
  }
  if (!assetsFilteredByPlatform?.length) {
    return null
  }
  if (assetsFilteredByPlatform.length === 1) {
    return assetsFilteredByPlatform[0]
  }
  let targetAsset
  if (os.platform() === 'darwin') {
    targetAsset = assetsFilteredByPlatform.find((it) => it.name.includes(`_${os.arch()}`))
  }
  return targetAsset
}

export const checkUpdateForUi = async (): Promise<NewReleaseInfo | null> => {
  let releaseList: GitHubReleaseItem[] = []
  try {
    const headers = new Headers()
    headers.append('Accept', 'application/vnd.github+json')
    headers.append('X-GitHub-Api-Version', '2022-11-28')
    await fetch(RELEASE_LIST_URL, {
      method: 'GET',
      headers: headers,
      redirect: 'follow'
    })
      .then((res) => res.json())
      .then((res) => {
        if (Array.isArray(res)) {
          releaseList = res
        } else {
          throw res
        }
      })
  } catch (err) {
    gtag('check_update_error', { err: JSON.stringify(err) })
    console.log(err)
  }
  console.log(releaseList)
  const availableRelease = releaseList.find((it) => !it.draft && !it.prerelease)
  if (!availableRelease) {
    return null
  }
  const availableReleaseVersion = availableRelease.tag_name.replace(/^(ui-v)/, '')
  if (!semver.gt(availableReleaseVersion, packageJson.version)) {
    return null
  }
  const { assets } = availableRelease
  const targetAsset = findTargetAsset(assets ?? [])
  if (targetAsset) {
    gtag('update_found', {
      currentVersion: packageJson.version,
      newVersion: availableReleaseVersion
    })
    console.log(targetAsset)
    return {
      releaseVersion: availableReleaseVersion,
      releasePageUrl: availableRelease.html_url,
      assetUrl: targetAsset.browser_download_url,
      assetName: targetAsset.name,
      releaseNote: availableRelease.body
    }
  }
  return null
}
