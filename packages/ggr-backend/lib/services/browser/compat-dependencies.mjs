import fs from 'node:fs'
import os from 'node:os'
import { createRuntimePaths } from '../../runtime-paths.mjs'
import { createDefaultBrowserDependencies } from './dependencies/default-dependencies.mjs'

function fd3Output() {
  try { return fs.createWriteStream(null, { fd: 3, autoClose: false }) } catch { return null }
}

function write(output, data) {
  output?.write(`${JSON.stringify(data)}\n`)
}

/** Legacy direct-entry adapter. Dependency discovery and download stay backend-owned. */
export async function downloadDependenciesForInit({ output = fd3Output(), runtimePaths = createRuntimePaths(os.homedir()) } = {}) {
  write(output, { type: 'NEED_RESETUP_DEPENDENCIES' })
  const dependencies = await createDefaultBrowserDependencies({ runtimePaths })
  try {
    const browser = await dependencies.ensure({
      downloadProgressCallback(downloadedBytes, totalBytes) {
        write(output, { type: 'PUPPETEER_DOWNLOAD_PROGRESS', downloadedBytes, totalBytes })
      }
    })
    return browser.executablePath
  } catch (error) {
    write(output, {
      type: 'PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR',
      ...(error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : {})
    })
    throw error
  }
}
