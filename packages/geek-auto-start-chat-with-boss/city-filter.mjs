const CITY_FILTER_TRIGGER_SELECTOR = '.page-jobs-main .filter-condition-inner [ka="switch_city_dialog_open"], [ka="switch_city_dialog_open"]'
const CITY_DIALOG_SELECTOR = '.city-select-dialog'

function cityFilterError(cause) {
  return Object.assign(new Error('Configured city filter was not applied'), {
    code: 'CITY_FILTER_NOT_APPLIED',
    cause
  })
}

export async function applyCityFilter({ page, cityName }) {
  if (!page || typeof cityName !== 'string' || !cityName.trim()) throw cityFilterError()
  try {
    const expectedCityName = cityName.trim()
    const trigger = await page.$(CITY_FILTER_TRIGGER_SELECTOR)
    if (!trigger) throw cityFilterError()
    if (await trigger.evaluate((element) => element.textContent.trim()) === expectedCityName) return

    await trigger.click()
    await page.waitForFunction((selector) => {
      const dialog = document.querySelector(selector)
      return dialog && window.getComputedStyle(dialog).display !== 'none'
    }, {}, CITY_DIALOG_SELECTOR)

    const option = (await page.evaluateHandle(({ cityName, dialogSelector }) => {
      const dialog = document.querySelector(dialogSelector)
      if (!dialog) return null
      return [...dialog.querySelectorAll('li, a')].find((element) => {
        if (element.textContent.trim() !== cityName) return false
        for (let current = element; current && current !== dialog.parentElement; current = current.parentElement) {
          const style = window.getComputedStyle(current)
          if (style.display === 'none' || style.visibility === 'hidden') return false
        }
        return true
      }) ?? null
    }, { cityName: expectedCityName, dialogSelector: CITY_DIALOG_SELECTOR })).asElement()
    if (!option) throw cityFilterError()

    await option.click()
    await page.waitForFunction(({ selector, cityName }) => {
      const trigger = document.querySelector(selector)
      return trigger?.textContent?.trim() === cityName
    }, {}, { selector: CITY_FILTER_TRIGGER_SELECTOR, cityName: expectedCityName })
  } catch (error) {
    if (error?.code === 'CITY_FILTER_NOT_APPLIED') throw error
    throw cityFilterError(error)
  }
}
