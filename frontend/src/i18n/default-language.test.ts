import { describe, expect, it } from "vitest"

import i18n, { languages } from "./index"

describe("language priority", () => {
  it("uses Persian as the primary language and English as the secondary language", () => {
    expect(Object.keys(languages)).toEqual(["fa", "en"])
    expect(i18n.language).toBe("fa")
  })
})
