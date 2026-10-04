import {
  javascriptLanguage,
  typescriptLanguage,
  jsxLanguage,
  tsxLanguage,
} from "@codemirror/lang-javascript";
import { pythonLanguage } from "@codemirror/lang-python";
import { jsonLanguage } from "@codemirror/lang-json";
import { htmlLanguage } from "@codemirror/lang-html";
import { cssLanguage } from "@codemirror/lang-css";
import type { Language } from "@codemirror/language";

const languages: Record<string, Language> = {
  javascript: javascriptLanguage,
  js: javascriptLanguage,
  typescript: typescriptLanguage,
  ts: typescriptLanguage,
  jsx: jsxLanguage,
  tsx: tsxLanguage,
  python: pythonLanguage,
  py: pythonLanguage,
  json: jsonLanguage,
  html: htmlLanguage,
  css: cssLanguage,
};

export function codeLanguage(info: string): Language | null {
  const name = info.trim().split(/\s+/)[0].toLowerCase();
  return Object.hasOwn(languages, name) ? languages[name] : null;
}
