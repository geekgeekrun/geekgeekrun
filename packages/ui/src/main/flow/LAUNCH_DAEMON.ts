import attachListenerForKillSelfOnParentExited from '../utils/attachListenerForKillSelfOnParentExited'
;(async () => {
  process.once('disconnect', () => {
    process.exit(0)
  })
  attachListenerForKillSelfOnParentExited()
  await import('@geekgeekrun/pm/daemon.js')
})()

export {}
