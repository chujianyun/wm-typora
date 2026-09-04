import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import type { EditorAdapter } from "./EditorAdapter";
import { SourceEditor } from "./SourceEditor";
import { VisualEditor } from "./VisualEditor";

describe.each([
  ["source", SourceEditor],
  ["visual", VisualEditor],
] as const)("%s editor adapter", (_name, Editor) => {
  it("gets and sets Markdown through the common adapter", async () => {
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    const { container } = render(
      <Editor value="# Initial" onChange={() => undefined} adapterRef={adapterRef} />,
    );

    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe("# Initial"));
    expect(adapterRef.current?.navigateToLine).toEqual(expect.any(Function));
    expect(adapterRef.current?.countMatches).toEqual(expect.any(Function));
    expect(adapterRef.current?.replaceAllMatches).toEqual(expect.any(Function));
    expect(adapterRef.current?.revealMatch).toEqual(expect.any(Function));
    adapterRef.current!.setMarkdown("# Updated");

    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe("# Updated"));
    expect(container).toHaveTextContent("Updated");
  });
});

describe("source editor navigation", () => {
  it("reveals a requested line and literal match", async () => {
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    render(
      <SourceEditor
        value={"first\nalpha second\nalpha third"}
        onChange={() => undefined}
        adapterRef={adapterRef}
      />,
    );
    await waitFor(() => expect(adapterRef.current).not.toBeNull());

    adapterRef.current!.navigateToLine(2);
    expect(adapterRef.current!.getCursor()).toEqual({ line: 2, column: 1 });

    adapterRef.current!.revealMatch("alpha", 1);
    expect(adapterRef.current!.getCursor()).toEqual({ line: 3, column: 6 });
  });
});

describe("visual editor initialization", () => {
  it("starts directly in the document body when YAML front matter is absent", async () => {
    render(<VisualEditor value="# Body" onChange={() => undefined} />);

    expect(screen.queryByRole("button", { name: "+ Front Matter" })).not.toBeInTheDocument();
    expect(await screen.findByText("Body")).toBeInTheDocument();
  });

  it("applies the latest controlled value while the editor is starting", async () => {
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    const { rerender } = render(
      <VisualEditor value="first" onChange={() => undefined} adapterRef={adapterRef} />,
    );
    rerender(
      <VisualEditor value="latest" onChange={() => undefined} adapterRef={adapterRef} />,
    );

    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe("latest"));
  });

  it("renders Mermaid code blocks as an inline preview", async () => {
    const { container } = render(
      <VisualEditor
        value={"```mermaid\nflowchart LR\nA-->B\n```"}
        onChange={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(container.querySelector("[data-mermaid-preview] svg")).toBeInTheDocument(),
    );
  });

  it("preserves and edits YAML front matter as a dedicated visual block", async () => {
    const onChange = vi.fn();
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    const markdown = "---\ntitle: Original\ntags:\n  - notes\n---\n# Body";
    render(<VisualEditor value={markdown} onChange={onChange} adapterRef={adapterRef} />);

    const input = await screen.findByRole("textbox", { name: "YAML Front Matter" });
    expect(input).toHaveValue("title: Original\ntags:\n  - notes");
    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe(markdown));

    fireEvent.change(input, { target: { value: "title: Updated" } });
    expect(onChange).toHaveBeenLastCalledWith("---\ntitle: Updated\n---\n# Body");
  });

  it("recognizes standard empty YAML front matter", async () => {
    const onChange = vi.fn();
    render(
      <VisualEditor
        value={"---\n---\n# Body"}
        onChange={onChange}
      />,
    );

    const frontMatter = await screen.findByLabelText("YAML Front Matter");
    expect(frontMatter).toHaveValue("");
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("includes visible YAML front matter in visual find, replace and cursor reporting", async () => {
    const onChange = vi.fn();
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    render(
      <VisualEditor
        value={"---\ntitle: alpha\n---\nalpha body"}
        onChange={onChange}
        adapterRef={adapterRef}
      />,
    );
    const frontMatter = await screen.findByRole("textbox", {
      name: "YAML Front Matter",
    }) as HTMLTextAreaElement;
    await waitFor(() => expect(adapterRef.current).not.toBeNull());

    expect(adapterRef.current!.countMatches("alpha")).toBe(2);
    adapterRef.current!.revealMatch("alpha", 0);
    expect(frontMatter).toHaveProperty("selectionStart", 7);
    expect(frontMatter).toHaveProperty("selectionEnd", 12);

    frontMatter.focus();
    frontMatter.setSelectionRange(8, 8);
    expect(adapterRef.current!.getCursor()).toEqual({ line: 2, column: 9 });

    act(() => adapterRef.current!.replaceAllMatches("alpha", "omega"));
    await waitFor(() =>
      expect(adapterRef.current!.getMarkdown()).toBe("---\ntitle: omega\n---\nomega body\n"),
    );
    expect(onChange).toHaveBeenLastCalledWith("---\ntitle: omega\n---\nomega body\n");
  });

  it("counts only rendered text when searching in visual mode", async () => {
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    render(
      <VisualEditor
        value="**alpha** [link](https://alpha.example)"
        onChange={() => undefined}
        adapterRef={adapterRef}
      />,
    );
    await waitFor(() => expect(adapterRef.current).not.toBeNull());

    expect(adapterRef.current!.countMatches("alpha")).toBe(1);
    expect(adapterRef.current!.countMatches("link")).toBe(1);
    adapterRef.current!.replaceAllMatches("alpha", "omega");
    await waitFor(() =>
      expect(adapterRef.current!.getMarkdown()).toContain("omega"),
    );
    expect(adapterRef.current!.getMarkdown()).toContain("https://alpha.example");
    expect(adapterRef.current!.countMatches("alpha")).toBe(0);
  });

  it("reports a cursor position derived from the visual document selection", async () => {
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    render(
      <VisualEditor
        value={"first paragraph\n\nsecond paragraph"}
        onChange={() => undefined}
        adapterRef={adapterRef}
      />,
    );
    await waitFor(() => expect(adapterRef.current).not.toBeNull());

    adapterRef.current!.revealMatch("second", 0);
    expect(adapterRef.current!.getCursor().line).toBeGreaterThan(1);
    expect(adapterRef.current!.getCursor().column).toBeGreaterThan(1);
  });
});
