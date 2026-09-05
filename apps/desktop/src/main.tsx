import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { nativeBridge } from "./native/bridge";
import { App } from "./app/App";
const root = createRoot(document.getElementById("root")!);
if (isTauri()) root.render(<App bridge={nativeBridge} />);
else if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("preview")
) {
  const { FakeBridge } = await import("./native/fakeBridge");
  root.render(<App bridge={new FakeBridge()} preview />);
} else
  root.render(
    <p style={{ fontFamily: "system-ui", padding: 32 }}>
      请从桌面应用打开 WTypora。开发预览请使用 ?preview=1。
    </p>,
  );
