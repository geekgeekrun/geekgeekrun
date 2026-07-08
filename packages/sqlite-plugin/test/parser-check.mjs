import assert from 'node:assert/strict'
import { parseSalary } from '../dist/utils/parser.js'

assert.deepEqual(parseSalary('10-15K'), { low: 10, high: 15, month: null, unit: 'month' })
assert.deepEqual(parseSalary('10-15K·13薪'), { low: 10, high: 15, month: 13, unit: 'month' })
assert.deepEqual(parseSalary('150-300元/天'), { low: 150, high: 300, month: null, unit: 'day' })
assert.deepEqual(parseSalary('实习补贴 150-300元/天'), { low: 150, high: 300, month: null, unit: 'day' })
assert.deepEqual(parseSalary('200元/天'), { low: 200, high: 200, month: null, unit: 'day' })
assert.deepEqual(parseSalary('150/天'), { low: 150, high: 150, month: null, unit: 'day' })
assert.deepEqual(parseSalary('300元/日'), { low: 300, high: 300, month: null, unit: 'day' })
assert.equal(parseSalary('薪资面议').unit, 'negotiable')
assert.equal(parseSalary('薪资不明').unit, 'unknown')

console.log('sqlite parser check passed')
