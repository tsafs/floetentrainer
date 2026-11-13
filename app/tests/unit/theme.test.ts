import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

function tokens(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("--") || l.startsWith("color-scheme"))
    .sort();
}

describe("Dunkelmodus", () => {
  it("„Wie das Handy“ und „Dunkel“ nutzen dieselben Farben", () => {
    const auto = css.match(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/)![1];
    const forced = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)![1];
    expect(tokens(auto).length).toBeGreaterThan(15);
    expect(tokens(forced)).toEqual(tokens(auto));
  });
});
