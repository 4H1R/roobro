import { describe, expect, it } from "vitest"

import { linkifyText } from "@/lib/linkify-text"

describe("linkifyText", () => {
  it("returns plain text untouched", () => {
    expect(linkifyText("hello there")).toEqual([{ type: "text", text: "hello there" }])
  })

  it("splits http and https links out of surrounding text", () => {
    expect(linkifyText("see https://roobro.ir/a?b=1 and http://x.com")).toEqual([
      { type: "text", text: "see " },
      { type: "link", text: "https://roobro.ir/a?b=1", href: "https://roobro.ir/a?b=1" },
      { type: "text", text: " and " },
      { type: "link", text: "http://x.com", href: "http://x.com" },
    ])
  })

  it("adds https to www links", () => {
    expect(linkifyText("www.example.com")).toEqual([{ type: "link", text: "www.example.com", href: "https://www.example.com" }])
  })

  it("leaves trailing sentence punctuation outside the link", () => {
    expect(linkifyText("go to https://example.com/path.")).toEqual([
      { type: "text", text: "go to " },
      { type: "link", text: "https://example.com/path", href: "https://example.com/path" },
      { type: "text", text: "." },
    ])
  })

  it("does not linkify non-http schemes", () => {
    expect(linkifyText("javascript:alert(1)")).toEqual([{ type: "text", text: "javascript:alert(1)" }])
  })
})
