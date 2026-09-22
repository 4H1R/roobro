import { describe, expect, it } from "vitest"
import { MAX_RETAINED_CHAT_MESSAGES, mergeChatMessages } from "@/lib/chat-history"

describe("bounded chat history", () => {
  it("bounds state through repeated overlapping polls without repeating IDs", () => {
    let messages: { id: number }[] = []
    for (let end = 200; end <= 2000; end += 100) {
      messages = mergeChatMessages(messages, Array.from({ length: 200 }, (_, i) => ({ id: end - 199 + i })))
      expect(messages).toHaveLength(MAX_RETAINED_CHAT_MESSAGES)
      expect(new Set(messages.map((item) => item.id)).size).toBe(200)
    }
    expect(messages[0].id).toBe(1801)
    expect(messages.at(-1)?.id).toBe(2000)
  })

  it("preserves a local send when an older poll completes and backfills newly enabled history", () => {
    const sent = mergeChatMessages([{ id: 10 }], [{ id: 11 }])
    expect(mergeChatMessages(sent, [{ id: 9 }, { id: 10 }])).toEqual([{ id: 9 }, { id: 10 }, { id: 11 }])
    expect(mergeChatMessages([{ id: 3 }], [{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
  })

  it("also bounds local demo messages", () => {
    expect(mergeChatMessages([], Array.from({ length: 500 }, () => ({ id: undefined, text: "demo" })))).toHaveLength(200)
  })
})
