import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { insertAddress, setHeading, toggleEmphasis } from "./formatting";
import "./selection-toolbar.css";

export function selectionToolbar(upload: (files: File[]) => void) {
  return ViewPlugin.fromClass(
    class {
      dom = document.createElement("div");
      dismissed = false;
      dragging = false;
      constructor(readonly view: EditorView) {
        this.dom.className = "selection-toolbar";
        this.dom.setAttribute("role", "toolbar");
        this.dom.setAttribute("aria-label", "文本格式");
        this.dom.hidden = true;
        this.dom.addEventListener("mousedown", (e) => {
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        });
        this.view.dom.append(this.dom);
        document.addEventListener("pointerdown", this.down, true);
        document.addEventListener("pointerup", this.up, true);
        document.addEventListener("keydown", this.key, true);
        document.addEventListener("focusin", this.focus);
        this.view.scrollDOM.addEventListener("scroll", this.position);
        window.addEventListener("resize", this.position);
        this.render();
      }
      button(label: string, text: string, action: () => void) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.onclick = action;
        return button;
      }
      render() {
        this.dom.replaceChildren();
        const headings = document.createElement("select");
        headings.setAttribute("aria-label", "标题级别");
        for (let i = 0; i <= 6; i++)
          headings.add(new Option(i ? `H${i} 标题` : "正文", String(i)));
        const line = this.view.state.doc.lineAt(
          this.view.state.selection.main.from,
        ).text;
        headings.value = String(
          /^( {0,3})(#{1,6})(?:\s|$)/.exec(line)?.[2].length ?? 0,
        );
        headings.onchange = () => setHeading(this.view, Number(headings.value));
        this.dom.append(
          headings,
          this.button("加粗", "B", () => toggleEmphasis(this.view, "**")),
          this.button("斜体", "I", () => toggleEmphasis(this.view, "*")),
          this.button("超链接", "链接", () => this.address(false)),
          this.button("插入图片", "图片", () => this.address(true)),
        );
      }
      address(isImage: boolean) {
        const form = document.createElement("form");
        form.className = "format-address";
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = isImage
          ? "图片地址 https://…"
          : "链接地址 https://…";
        input.setAttribute("aria-label", isImage ? "图片地址" : "链接地址");
        const error = document.createElement("span");
        error.className = "format-error";
        error.setAttribute("role", "alert");
        const submit = this.button("插入", "插入", () => form.requestSubmit());
        form.append(
          input,
          submit,
          this.button("取消", "取消", () => {
            this.render();
            this.view.focus();
            this.position();
          }),
        );
        if (isImage) {
          const file = document.createElement("input");
          file.type = "file";
          file.accept = "image/png,image/jpeg,image/gif,image/webp,image/bmp";
          file.hidden = true;
          file.onchange = () => {
            if (file.files?.length) {
              upload(Array.from(file.files));
              this.dismissed = true;
              this.dom.hidden = true;
              this.view.focus();
            }
          };
          form.append(
            this.button("选择本地图片", "本地图片…", () => file.click()),
            file,
          );
        }
        form.append(error);
        form.onsubmit = (e) => {
          e.preventDefault();
          if (!insertAddress(this.view, input.value, isImage)) {
            error.textContent = isImage
              ? "请输入有效的 HTTP(S) 图片地址"
              : "请输入 HTTP(S) 或 mailto 链接";
            this.position();
          }
        };
        this.dom.replaceChildren(form);
        input.focus();
        this.position();
      }
      down = (event: PointerEvent) => {
        if (this.dom.contains(event.target as Node)) return;
        if (this.view.contentDOM.contains(event.target as Node)) {
          this.dragging = true;
          this.dismissed = false;
        } else this.dismissed = true;
        this.dom.hidden = true;
      };
      up = () => {
        if (this.dragging) {
          this.dragging = false;
          this.position();
        }
      };
      key = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !this.dom.hidden) {
          event.preventDefault();
          event.stopPropagation();
          this.dismissed = true;
          this.dom.hidden = true;
          this.view.focus();
        }
      };
      focus = () => {
        if (!this.view.dom.contains(document.activeElement)) {
          this.dismissed = true;
          this.dom.hidden = true;
        } else this.position();
      };
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          this.dismissed = false;
          this.render();
        }
        this.position();
      }
      position = () => {
        const selection = this.view.state.selection.main;
        if (
          selection.empty ||
          this.view.state.readOnly ||
          this.view.composing ||
          this.view.state.selection.ranges.length !== 1 ||
          this.dismissed ||
          this.dragging ||
          !this.view.dom.contains(document.activeElement)
        ) {
          this.dom.hidden = true;
          return;
        }
        this.view.requestMeasure({
          key: this,
          read: (view) => ({
            rect: view.coordsAtPos(selection.from),
            bounds: view.scrollDOM.getBoundingClientRect(),
            width: this.dom.offsetWidth || 320,
            height: this.dom.offsetHeight || 42,
          }),
          write: ({ rect, bounds, width, height }) => {
            if (
              !rect ||
              rect.bottom < bounds.top ||
              rect.top > bounds.bottom ||
              this.dismissed ||
              this.dragging ||
              this.view.state.selection.main.empty
            ) {
              this.dom.hidden = true;
              return;
            }
            this.dom.hidden = false;
            this.dom.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
            this.dom.style.top = `${Math.max(8, Math.min(rect.top - height - 8 >= bounds.top ? rect.top - height - 8 : rect.bottom + 8, window.innerHeight - height - 8))}px`;
          },
        });
      };
      destroy() {
        document.removeEventListener("pointerdown", this.down, true);
        document.removeEventListener("pointerup", this.up, true);
        document.removeEventListener("keydown", this.key, true);
        document.removeEventListener("focusin", this.focus);
        this.view.scrollDOM.removeEventListener("scroll", this.position);
        window.removeEventListener("resize", this.position);
        this.dom.remove();
      }
    },
  );
}
