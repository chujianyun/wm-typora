import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import type { EmbeddedImage } from "./document";

export async function createDocx(
  root: HTMLElement,
  images: Map<Element, EmbeddedImage>,
  title: string,
) {
  const numbering: { reference: string; start: number }[] = [];
  const inline = (
    node: Node,
    style: IRunOptions = {},
    maxWidth = 600,
  ): ParagraphChild[] => {
    if (node.nodeType === Node.TEXT_NODE)
      return (node.textContent ?? "")
        .split("\n")
        .map(
          (text, index) =>
            new TextRun({ ...style, text, ...(index ? { break: 1 } : {}) }),
        );
    if (!(node instanceof Element)) return [];
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return [new TextRun({ break: 1 })];
    if (tag === "img") {
      const image = images.get(node);
      return image
        ? [
            new ImageRun({
              type: "png",
              data: image.data,
              transformation: {
                width: Math.min(image.width, maxWidth),
                height: image.height * Math.min(1, maxWidth / image.width),
              },
              altText: {
                title: node.getAttribute("alt") || "图片",
                description: node.getAttribute("alt") || "",
                name: "图片",
              },
            }),
          ]
        : [];
    }
    const next = {
      ...style,
      ...(tag === "strong" ? { bold: true } : {}),
      ...(tag === "em" ? { italics: true } : {}),
      ...(tag === "del" ? { strike: true } : {}),
      ...(tag === "code"
        ? { font: "Menlo", size: 19, shading: { fill: "F5F6F8" } }
        : {}),
    };
    const children = Array.from(node.childNodes).flatMap((child) =>
      inline(child, next, maxWidth),
    );
    const href = node.getAttribute("href");
    if (tag === "a" && href && /^(https?:|mailto:)/i.test(href))
      return [new ExternalHyperlink({ link: href, children })];
    return children;
  };
  type Block = Paragraph | Table;
  const blocks = (nodes: Element[], indent = 0): Block[] => {
    const result: Block[] = [];
    for (const node of nodes) {
      const tag = node.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        const reference = `list-${numbering.length}`;
        if (tag === "ol")
          numbering.push({
            reference,
            start: Number(node.getAttribute("start")) || 1,
          });
        for (const item of node.children) {
          const marker = item.classList.contains("task-list-item")
            ? { indent: { left: (indent + 1) * 720 } }
            : tag === "ol"
              ? { numbering: { reference, level: Math.min(indent, 8) } }
              : { bullet: { level: Math.min(indent, 8) } };
          let first = true;
          let pending: ParagraphChild[] = [];
          const flush = () => {
            if (!pending.length) return;
            result.push(
              new Paragraph({
                children: pending,
                ...(first ? marker : { indent: { left: (indent + 1) * 720 } }),
              }),
            );
            pending = [];
            first = false;
          };
          for (const child of item.childNodes) {
            if (
              child instanceof Element &&
              ["UL", "OL"].includes(child.tagName)
            ) {
              flush();
              result.push(...blocks([child], indent + 1));
            } else if (
              child instanceof Element &&
              ["P", "PRE", "BLOCKQUOTE", "TABLE"].includes(child.tagName)
            ) {
              flush();
              if (child.tagName === "P") {
                pending.push(
                  ...Array.from(child.childNodes).flatMap((n) => inline(n)),
                );
                flush();
              } else {
                result.push(...blocksElement(child, indent + 1));
              }
            } else if (
              child.nodeType !== Node.TEXT_NODE ||
              child.textContent?.trim()
            ) {
              pending.push(...inline(child));
            }
          }
          flush();
        }
      } else {
        result.push(...blocksElement(node, indent));
      }
    }
    return result;
  };
  const blocksElement = (node: Element, indent: number): Block[] => {
    const tag = node.tagName.toLowerCase();
    if (tag === "blockquote")
      return blocks(Array.from(node.children), indent + 1);
    if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr"));
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map(
            (row) =>
              new TableRow({
                tableHeader: row.parentElement?.tagName === "THEAD",
                children: Array.from(row.children).map(
                  (cell) =>
                    new TableCell({
                      width: {
                        size: 100 / row.children.length,
                        type: WidthType.PERCENTAGE,
                      },
                      ...(cell.tagName === "TH"
                        ? { shading: { fill: "F1F3F5" } }
                        : {}),
                      children: [
                        new Paragraph({
                          children: Array.from(cell.childNodes).flatMap((n) =>
                            inline(
                              n,
                              { bold: cell.tagName === "TH" },
                              560 / row.children.length,
                            ),
                          ),
                          alignment:
                            (cell as HTMLElement).style.textAlign === "right"
                              ? AlignmentType.RIGHT
                              : (cell as HTMLElement).style.textAlign ===
                                  "center"
                                ? AlignmentType.CENTER
                                : AlignmentType.LEFT,
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
        new Paragraph(""),
      ];
    }
    const heading = /^h([1-6])$/.exec(tag);
    const levels = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    if (tag === "hr")
      return [
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "AEB7C2" },
          },
        }),
      ];
    const content =
      tag === "pre"
        ? (node.textContent ?? "")
            .replace(/\n$/, "")
            .split("\n")
            .map(
              (text, index) =>
                new TextRun({
                  text,
                  font: "Menlo",
                  size: 19,
                  ...(index ? { break: 1 } : {}),
                }),
            )
        : Array.from(node.childNodes).flatMap((n) => inline(n));
    return [
      new Paragraph({
        children: content,
        ...(heading
          ? { heading: levels[Number(heading[1]) - 1], keepNext: true }
          : {}),
        ...(indent ? { indent: { left: indent * 360 } } : {}),
        ...(tag === "pre"
          ? {
              shading: { fill: "F5F6F8" },
              spacing: { before: 120, after: 160 },
            }
          : {}),
      }),
    ];
  };
  const children = blocks(Array.from(root.children));
  const doc = new Document({
    creator: "WTypora",
    title,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: "Arial", hAnsi: "Arial", eastAsia: "PingFang SC" },
            size: 22,
          },
          paragraph: { spacing: { after: 160, line: 330 } },
        },
      },
    },
    numbering: {
      config: numbering.map(({ reference, start }) => ({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          start,
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: (level + 1) * 720, hanging: 360 } },
          },
        })),
      })),
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children: children.length ? children : [new Paragraph("")],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
