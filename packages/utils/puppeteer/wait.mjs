export async function waitForPage(browser, predicate, {
  polling = 1000, timeout = 10 * 1000
} = {}) {
  let intervalTimer = null
  let timeoutTimer = null
  return await new Promise((resolve, reject) => {
    timeoutTimer = setTimeout(
      () => {
        clearInterval(intervalTimer)
        clearInterval(timeoutTimer)
        reject(
          new Error(`waitForPage timeout after ${timeout} ms`)
        )
      },
      timeout
    )
    intervalTimer = setInterval(async () => {
      const allPages = await browser.pages()
      let target = null
      for (let i = allPages.length - 1; i >= 0; i--) {
        const currentPage = allPages[i]
        if (
          await predicate(currentPage)
        ) {
          clearInterval(intervalTimer)
          clearInterval(timeoutTimer)
          resolve(currentPage)
        }
      }
    }, polling)
  })
}