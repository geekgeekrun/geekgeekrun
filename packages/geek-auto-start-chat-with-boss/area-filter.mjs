export function isJobAddressInExpectedArea(address, expectedAreas) {
  if (!Array.isArray(expectedAreas) || expectedAreas.length === 0) return true
  if (typeof address !== 'string' || !address.trim()) return false
  return expectedAreas.some((area) => address.includes(area))
}
