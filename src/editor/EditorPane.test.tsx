import { render, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import type { EditorAdapter } from "./EditorAdapter";
import { EditorPane } from "./EditorPane";

describe("EditorPane", () => {
  it("switches editors without transforming the Markdown exchange string", async () => {
    const markdown = "---\ncustom: value\n---\n\n:::unknown\nkeep me\n:::";
    const onChange = vi.fn();
    const adapterRef = { current: null } as RefObject<EditorAdapter | null>;
    const { rerender } = render(
      <EditorPane
        mode="source"
        markdown={markdown}
        onChange={onChange}
        adapterRef={adapterRef}
      />,
    );
    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe(markdown));

    rerender(
      <EditorPane
        mode="visual"
        markdown={markdown}
        onChange={onChange}
        adapterRef={adapterRef}
      />,
    );
    rerender(
      <EditorPane
        mode="source"
        markdown={markdown}
        onChange={onChange}
        adapterRef={adapterRef}
      />,
    );

    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe(markdown));
    expect(onChange).not.toHaveBeenCalled();
  });
});
