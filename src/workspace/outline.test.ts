import { buildOutline } from "./outline";

describe("buildOutline", () => {
  it("builds hierarchy, stable slugs and source line positions", () => {
    const markdown = [
      "# Project",
      "## Notes",
      "### Detail",
      "## Notes",
      "```md",
      "# Not a heading",
      "```",
    ].join("\n");

    expect(buildOutline(markdown)).toEqual([
      {
        id: "project",
        text: "Project",
        level: 1,
        line: 1,
        children: [
          {
            id: "notes",
            text: "Notes",
            level: 2,
            line: 2,
            children: [
              {
                id: "detail",
                text: "Detail",
                level: 3,
                line: 3,
                children: [],
              },
            ],
          },
          {
            id: "notes-2",
            text: "Notes",
            level: 2,
            line: 4,
            children: [],
          },
        ],
      },
    ]);
  });

  it("ignores YAML comments while preserving body source line numbers", () => {
    const markdown = ["---", "title: Note", "# Draft metadata", "---", "# Body"].join("\n");

    expect(buildOutline(markdown)).toEqual([
      {
        id: "body",
        text: "Body",
        level: 1,
        line: 5,
        children: [],
      },
    ]);
  });
});
