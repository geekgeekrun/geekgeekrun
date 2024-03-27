import { powerSaveBlocker } from 'electron'

export const initPowerSaveBlocker = (
  type: 'prevent-app-suspension' | 'prevent-display-sleep' = 'prevent-app-suspension'
) => {
  const id = powerSaveBlocker.start(type)
  return function disposePowerSaveBlocker() {
    return powerSaveBlocker.stop(id)
  }
}
