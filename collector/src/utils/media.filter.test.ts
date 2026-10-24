import { describe, expect, it } from "vitest";
import { cleanDescription, isProfane } from "./media.filter.js";

describe("isProfane", () => {
  it("allows ordinary channel and programme names", () => {
    expect(isProfane("BBC One")).toBe(false);
    expect(isProfane("Cockburn Live")).toBe(false);
    expect(isProfane("Scunthorpe United")).toBe(false);
  });

  it("flags profanity in names", () => {
    expect(isProfane("Fuck TV")).toBe(true);
    expect(isProfane("xXfuckXx")).toBe(true);
    expect(isProfane("sh1t")).toBe(true);
  });

  it("treats missing or blank values as safe", () => {
    expect(isProfane(undefined)).toBe(false);
    expect(isProfane(null)).toBe(false);
    expect(isProfane("   ")).toBe(false);
  });
});

describe("cleanDescription", () => {
  it("trims safe descriptions", () => {
    expect(cleanDescription("  A family drama.  ")).toBe("A family drama.");
  });

  it("drops profane and blank descriptions", () => {
    expect(cleanDescription("Fuck this")).toBeUndefined();
    expect(cleanDescription("   ")).toBeUndefined();
    expect(cleanDescription(undefined)).toBeUndefined();
  });
});
