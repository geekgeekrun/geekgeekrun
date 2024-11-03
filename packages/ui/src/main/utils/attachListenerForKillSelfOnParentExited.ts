import { sleep } from '@geekgeekrun/utils/sleep.mjs'

export default function attachListenerForKillSelfOnParentExited() {
  // #region period check is parent process existed
  // Store the parent process ID
  const parentPID = process.ppid
  // Function to check if the parent process is alive
  async function periodCheckParentProcess() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Try sending signal 0 to the parent process (this does not terminate the process)
        process.kill(parentPID, 0)
      } catch (err) {
        // If an error is thrown, the parent process doesn't exist anymore
        process.exit(0)
      }
      await sleep(1000)
    }
  }
  periodCheckParentProcess()
  // #endregion
}
