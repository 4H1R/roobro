// Matches the API's retained window. IDs are absolute, never array offsets.
export const MAX_RETAINED_CHAT_MESSAGES = 200

export function mergeChatMessages<T extends { id?: number }>(current: T[], incoming: T[]): T[] {
  const byID = new Map<number, T>()
  const local: T[] = []
  for (const message of [...current, ...incoming]) {
    if (message.id === undefined) local.push(message)
    else byID.set(message.id, message)
  }
  return [...[...byID.values()].sort((a, b) => a.id! - b.id!), ...local].slice(-MAX_RETAINED_CHAT_MESSAGES)
}
