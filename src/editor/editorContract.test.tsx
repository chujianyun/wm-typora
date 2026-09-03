import { render, waitFor } from "@testing-library/react";
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
    adapterRef.current!.setMarkdown("# Updated");

    await waitFor(() => expect(adapterRef.current?.getMarkdown()).toBe("# Updated"));
    expect(container).toHaveTextContent("Updated");
  });
});
