import { describe, expect, test } from "vitest";
import { getCardDimensions } from "../src/lib/cardUtils";
import { loadSettings, saveSettings } from "../src/lib/storage";

describe("phone cards and receipt settings", () => {
  test("phone export stays 1080 by 1920 for long paragraphs", () => {
    expect(
      getCardDimensions(
        "phone",
        "comment",
        "阅读留下痕迹。".repeat(100),
        "记录自己的思考。".repeat(20),
      ),
    ).toEqual({ width: 1080, height: 1920 });
  });
  test("receipt and phone selections survive reopening", () => {
    saveSettings({ template: "quote", theme: "receipt", size: "phone" });
    expect(loadSettings()).toEqual({
      template: "quote",
      theme: "receipt",
      size: "phone",
    });
  });
});
