export function resolveRerunInterval(environment = process.env) {
  const configured = Number(environment.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  return Number.isFinite(configured) ? configured : 5000
}
