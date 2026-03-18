/**
 * 招聘端推荐页 / 沟通页日志，支持按级别过滤。
 * 级别：debug < info < warn < error。setLevel 由主流程在读取 config 后调用。
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

let currentLevel = LEVELS.info

export function setLevel (level) {
  const n = LEVELS[level]
  if (n !== undefined) currentLevel = n
  else currentLevel = LEVELS.info
}

export function getLevel () {
  return currentLevel
}

function log (minLevel, method, ...args) {
  if (currentLevel <= minLevel) {
    console[method](...args)
  }
}

export function debug (...args) {
  log(LEVELS.debug, 'log', ...args)
}

export function info (...args) {
  log(LEVELS.info, 'log', ...args)
}

export function warn (...args) {
  log(LEVELS.warn, 'warn', ...args)
}

export function error (...args) {
  log(LEVELS.error, 'error', ...args)
}
