import { execSync } from 'child_process'
import { getPackageInfo } from './increase-package-version.mjs'

export default async function releaseVersion() {
  execSync(`git add -A`)
  const packageInfo = JSON.parse(getPackageInfo().toString('utf-8'))
  const tagName = `ui-v${packageInfo.version}`
  execSync(`git commit -m ${tagName}`, { stdio: ['inherit', 'inherit', 'inherit'] })
  execSync(`git tag ${tagName}`, { stdio: ['inherit', 'inherit', 'inherit'] })
  execSync(`git push origin ${tagName}`, { stdio: ['inherit', 'inherit', 'inherit'] })
}
