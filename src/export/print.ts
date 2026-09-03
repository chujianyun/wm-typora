export function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "打印预览";
  frame.srcdoc = html;
  frame.addEventListener("load", () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1_000);
  });
  document.body.append(frame);
}
