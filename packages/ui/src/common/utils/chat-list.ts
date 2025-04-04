export function messageForSaveFilter(it) {
  return (
    it.status !== 3 && // filter system notification out
    it.templateId === 1 && // filter system notification out
    ((['text', 'sticker', 'image', 'sound', 'comDesc'].includes(it.messageType) &&
      !it.extend?.greetingQuestionAnswer) || // include those message, filter out auto ask
      (it.messageType === 'dialog' && [0, 1, 2, 8, 11, 12, 14, 17, 33].includes(it?.dialog?.type))) // include message like resume, phone, map, etc., filter out auto ask
  )
}
