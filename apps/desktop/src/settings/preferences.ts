export const themes = [
  { id: "system", name: "跟随系统", description: "随系统切换明暗" },
  { id: "github", name: "GitHub", description: "清爽白底 · 无衬线" },
  { id: "newsprint", name: "Newsprint", description: "暖色纸张 · 衬线正文" },
  { id: "night", name: "Night", description: "深色背景 · 柔和对比" },
  { id: "sepia", name: "Sepia", description: "米色书页 · 安静阅读" },
  { id: "light-green", name: "浅绿色", description: "淡绿底色 · 清新柔和" },
  { id: "light-yellow", name: "浅黄色", description: "淡黄底色 · 温暖明亮" },
] as const;
export type Theme = (typeof themes)[number]["id"];
export type UploadSettings = {
  provider: "none" | "picgo" | "picgo-core";
  endpoint: string;
  executable: string;
  imageAlt: "filename" | "empty";
};
export type Preferences = { theme: Theme; upload: UploadSettings };
export const preferenceKey = "wtypora.preferences.v1";
export const defaults: Preferences = {
  theme: "system",
  upload: {
    provider: "none",
    endpoint: "http://127.0.0.1:36677/upload",
    executable: "picgo",
    imageAlt: "filename",
  },
};
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
    return {
      theme: themes.some((t) => t.id === value?.theme)
        ? value.theme
        : defaults.theme,
      upload: {
        provider: ["picgo", "picgo-core"].includes(value?.upload?.provider)
          ? value.upload.provider
          : "none",
        endpoint:
          typeof value?.upload?.endpoint === "string"
            ? value.upload.endpoint
            : defaults.upload.endpoint,
        executable:
          typeof value?.upload?.executable === "string"
            ? value.upload.executable
            : defaults.upload.executable,
        imageAlt: value?.upload?.imageAlt === "empty" ? "empty" : "filename",
      },
    };
  } catch {
    return structuredClone(defaults);
  }
}
export function savePreferences(value: Preferences) {
  localStorage.setItem(preferenceKey, JSON.stringify(value));
}
