export enum RequestSceneEnum {
  testing = 1,
  readNoReplyAutoReminder = 2,
  geekAutoStartChatWithBoss = 3
}

// LLM requests are recorded by the backend worker that executes them. Electron
// keeps this export only for source compatibility with legacy UI callers.
export const recordGptCompletionRequest = async (_payload: unknown) => undefined
