import { calculateStatistics } from "./statistics";

describe("calculateStatistics", () => {
  it("counts readable words, characters, lines and minutes", () => {
    expect(calculateStatistics("# Hello 世界\n\nThis is **WTypora**.")).toEqual({
      words: 6,
      characters: 21,
      lines: 3,
      readingMinutes: 1,
    });
  });

  it("returns zero reading time for an empty document", () => {
    expect(calculateStatistics("")).toEqual({
      words: 0,
      characters: 0,
      lines: 1,
      readingMinutes: 0,
    });
  });
});
