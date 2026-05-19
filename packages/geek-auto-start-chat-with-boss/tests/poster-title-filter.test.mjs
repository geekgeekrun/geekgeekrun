import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPosterHrTitleRegExp, testIfPosterTitleSuit } from './poster-title-filter.mjs'

const defaultConfig = {
  isPosterHrFilterEnabled: true,
  posterHrTitleRegExpStr: 'HR|HRBP|HRG|Recruiter|Talent Acquisition|招聘|人事|人力|人资',
}

test('buildPosterHrTitleRegExp returns null when filter is disabled', () => {
  const regExp = buildPosterHrTitleRegExp({
    isPosterHrFilterEnabled: false,
    posterHrTitleRegExpStr: defaultConfig.posterHrTitleRegExpStr,
  })
  assert.equal(regExp, null)
})

test('buildPosterHrTitleRegExp returns null for invalid regex', () => {
  const regExp = buildPosterHrTitleRegExp({
    isPosterHrFilterEnabled: true,
    posterHrTitleRegExpStr: '[invalid',
  })
  assert.equal(regExp, null)
})

test('allows common HR / recruiter titles', () => {
  const cases = [
    { title: 'HR' },
    { title: 'HRBP' },
    { title: '招聘专员' },
    { title: '人事经理' },
    { title: 'Talent Acquisition Partner' },
    { title: 'Senior Recruiter' },
  ]
  for (const bossInfo of cases) {
    assert.equal(testIfPosterTitleSuit(bossInfo, defaultConfig), true, bossInfo.title)
  }
})

test('rejects non-HR titles under the same whitelist', () => {
  const cases = [
    { title: '技术总监' },
    { title: '项目经理' },
    { title: '创始人' },
    { title: 'CTO' },
    { title: '后端负责人' },
  ]
  for (const bossInfo of cases) {
    assert.equal(testIfPosterTitleSuit(bossInfo, defaultConfig), false, bossInfo.title)
  }
})

test('rejects empty or missing title when filter is enabled', () => {
  assert.equal(testIfPosterTitleSuit({}, defaultConfig), false)
  assert.equal(testIfPosterTitleSuit({ title: '' }, defaultConfig), false)
  assert.equal(testIfPosterTitleSuit({ title: '   ' }, defaultConfig), false)
})

test('does not filter anything when feature is disabled', () => {
  const config = {
    isPosterHrFilterEnabled: false,
    posterHrTitleRegExpStr: defaultConfig.posterHrTitleRegExpStr,
  }
  assert.equal(testIfPosterTitleSuit({ title: '技术总监' }, config), true)
  assert.equal(testIfPosterTitleSuit({}, config), true)
})
