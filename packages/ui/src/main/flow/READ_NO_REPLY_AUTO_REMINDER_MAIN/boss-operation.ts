// Temporary Electron compatibility exports. Business behavior is backend-owned.
export {
  defaultPromptMap,
  getGptContent,
  getValidTemplate,
  requestNewMessageContent,
  sendLookForwardReplyEmotion,
  sendMessage,
  writeDefaultAutoRemindPrompt
} from '../../../../../ggr-backend/lib/workers/read-no-reply/llm.mjs'
