import { describe, expect, it } from "vitest"

import i18n, { languages } from "@/i18n"

describe("language priority", () => {
  it("only registers Persian while keeping translations in i18next", () => {
    expect(Object.keys(languages)).toEqual(["fa"])
    expect(Object.keys(i18n.options.resources ?? {})).toEqual(["fa"])
    expect(i18n.language).toBe("fa")
  })
})
