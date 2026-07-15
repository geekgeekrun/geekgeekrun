import assert from 'node:assert/strict'

import { isJobAddressInExpectedArea } from '../area-filter.mjs'

assert.equal(
  isJobAddressInExpectedArea('', ['宝安', '南山', '福田']),
  false,
  'an empty list-card address must not decide whether a job is in an expected area'
)
assert.equal(isJobAddressInExpectedArea('深圳市南山区科技园', ['宝安', '南山', '福田']), true)
assert.equal(isJobAddressInExpectedArea('深圳市龙岗区坂田', ['宝安', '南山', '福田']), false)
assert.equal(isJobAddressInExpectedArea('深圳市龙岗区坂田', []), true)

console.log('area filter check passed')
