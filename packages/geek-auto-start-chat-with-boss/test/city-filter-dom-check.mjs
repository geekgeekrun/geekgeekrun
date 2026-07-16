import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'

import { applyCityFilter } from '../city-filter.mjs'

const browser = await puppeteer.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setContent(`
    <button ka="switch_city_dialog_open" class="active">北京</button>
    <div class="city-select-dialog" style="display: block">
      <div class="city-select-wrapper">
        <ul style="display: none"><li id="hidden-shenzhen">深圳</li></ul>
        <ul class="city-list-hot"><li>北京</li><li id="shenzhen">深圳</li></ul>
      </div>
    </div>
    <script>
      document.querySelector('#shenzhen').addEventListener('click', () => {
        document.querySelector('[ka="switch_city_dialog_open"]').textContent = '深圳'
      })
    </script>
  `)

  await applyCityFilter({ page, cityName: '深圳' })
  assert.equal(await page.$eval('[ka="switch_city_dialog_open"]', (element) => element.textContent.trim()), '深圳')

  await page.setContent(`
    <button ka="switch_city_dialog_open" class="active">北京</button>
    <div class="city-select-dialog" style="display: block">
      <div class="city-select-wrapper"><ul class="city-list-hot"><li>北京</li></ul></div>
    </div>
  `)
  await assert.rejects(
    applyCityFilter({ page, cityName: '深圳' }),
    (error) => error?.code === 'CITY_FILTER_NOT_APPLIED'
  )
} finally {
  await browser.close()
}

console.log('city filter DOM check passed')
