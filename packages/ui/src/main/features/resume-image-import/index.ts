import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const supportedExtensionSet = new Set(['.doc', '.docx', '.pdf', '.jpg', '.jpeg', '.png'])
const wordExtensionSet = new Set(['.doc', '.docx'])
const jpegExtensionSet = new Set(['.jpg', '.jpeg'])

export type ResumeImageImportResult = {
  resumeImagePath: string
  pageCount: number
}

type Canvas = {
  width: number
  height: number
  getContext: (contextId: '2d') => CanvasRenderingContext
  encode: (format: 'jpeg', quality: number) => Promise<Uint8Array>
}

type CanvasRenderingContext = {
  fillStyle: string
  fillRect: (x: number, y: number, width: number, height: number) => void
  drawImage: (image: Canvas | LoadedImage, dx: number, dy: number) => void
}

type LoadedImage = {
  width: number
  height: number
}

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: {
    canvasContext: CanvasRenderingContext
    viewport: { width: number; height: number }
  }) => { promise: Promise<void> }
}

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
  destroy: () => Promise<void>
}

function getStandardFontDataUrl() {
  const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
  return pathToFileURL(path.join(packageRoot, 'standard_fonts') + path.sep).href
}

function getResumeImageFolderPath() {
  return path.join(app.getPath('home'), '.geekgeekrun', 'resume-images')
}

function getOutputFilePath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(getResumeImageFolderPath(), `resume-${stamp}.jpg`)
}

async function assertReadableFile(filePath: string) {
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) {
    throw new Error('请选择一个文件，而不是文件夹。')
  }
  if (!stat.size) {
    throw new Error('简历文件为空，无法导入。')
  }
}

async function convertWordToPdf(sourcePath: string, tempFolderPath: string) {
  const outputPath = path.join(tempFolderPath, 'resume.pdf')
  const script = `
$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($env:GEEKGEEKRUN_RESUME_SOURCE, $false, $true)
  $document.ExportAsFixedFormat($env:GEEKGEEKRUN_RESUME_PDF, 17)
} finally {
  if ($document -ne $null) { $document.Close($false) }
  if ($word -ne $null) { $word.Quit() }
}
`
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true,
        timeout: 90_000,
        env: {
          ...process.env,
          GEEKGEEKRUN_RESUME_SOURCE: sourcePath,
          GEEKGEEKRUN_RESUME_PDF: outputPath
        }
      }
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Word 转换失败。请确认已安装 Microsoft Word，且文件未受密码保护。${detail}`)
  }
  await assertReadableFile(outputPath)
  return outputPath
}

async function renderPdfToJpeg(sourcePath: string, outputPath: string) {
  const [canvasPackage, pdfjs] = await Promise.all([
    import('@napi-rs/canvas'),
    import('pdfjs-dist/legacy/build/pdf.mjs')
  ])
  const { createCanvas } = canvasPackage as unknown as {
    createCanvas: (width: number, height: number) => Canvas
  }
  const data = new Uint8Array(await fs.readFile(sourcePath))
  const document = await (
    pdfjs as {
      getDocument: (options: {
        data: Uint8Array
        disableWorker: boolean
        standardFontDataUrl: string
        verbosity: number
      }) => {
        promise: Promise<PdfDocument>
      }
    }
  ).getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: getStandardFontDataUrl(),
    // Avoid emitting non-fatal PDF.js warnings through Electron's stdout pipe.
    verbosity: 0
  }).promise
  if (!document.numPages) {
    throw new Error('PDF 中没有可转换的页面。')
  }

  const pages: Array<{ canvas: Canvas; width: number; height: number }> = []
  const scale = 1.5
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise
    pages.push({ canvas, width: canvas.width, height: canvas.height })
  }
  await document.destroy()

  const width = Math.max(...pages.map((page) => page.width))
  const height = pages.reduce((total, page) => total + page.height, 0)
  const outputCanvas = createCanvas(width, height)
  const outputContext = outputCanvas.getContext('2d')
  outputContext.fillStyle = '#ffffff'
  outputContext.fillRect(0, 0, width, height)
  let offsetY = 0
  for (const page of pages) {
    outputContext.drawImage(page.canvas, Math.floor((width - page.width) / 2), offsetY)
    offsetY += page.height
  }
  await fs.writeFile(outputPath, await outputCanvas.encode('jpeg', 90))
  return pages.length
}

async function convertPngToJpeg(sourcePath: string, outputPath: string) {
  const canvasPackage = await import('@napi-rs/canvas')
  const { createCanvas, loadImage } = canvasPackage as unknown as {
    createCanvas: (width: number, height: number) => Canvas
    loadImage: (source: string) => Promise<LoadedImage>
  }
  const image = await loadImage(sourcePath)
  if (!image.width || !image.height) {
    throw new Error('PNG 图片尺寸无效，无法导入。')
  }
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  await fs.writeFile(outputPath, await canvas.encode('jpeg', 90))
}

export async function importResumeImage(sourcePath: string): Promise<ResumeImageImportResult> {
  const extension = path.extname(sourcePath).toLowerCase()
  if (!supportedExtensionSet.has(extension)) {
    throw new Error('仅支持 Word、PDF、JPG、JPEG 和 PNG 格式的简历。')
  }
  await assertReadableFile(sourcePath)
  await fs.mkdir(getResumeImageFolderPath(), { recursive: true })
  const outputPath = getOutputFilePath()
  const tempFolderPath = await fs.mkdtemp(path.join(app.getPath('temp'), 'geekgeekrun-resume-'))

  try {
    if (jpegExtensionSet.has(extension)) {
      await fs.copyFile(sourcePath, outputPath)
      return { resumeImagePath: outputPath, pageCount: 1 }
    }
    if (extension === '.png') {
      await convertPngToJpeg(sourcePath, outputPath)
      return { resumeImagePath: outputPath, pageCount: 1 }
    }
    const pdfPath = wordExtensionSet.has(extension)
      ? await convertWordToPdf(sourcePath, tempFolderPath)
      : sourcePath
    return {
      resumeImagePath: outputPath,
      pageCount: await renderPdfToJpeg(pdfPath, outputPath)
    }
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined)
    throw error
  } finally {
    await fs.rm(tempFolderPath, { recursive: true, force: true }).catch(() => undefined)
  }
}
