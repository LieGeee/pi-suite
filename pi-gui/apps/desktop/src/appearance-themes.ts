import type { AppearanceThemeRecord } from "./desktop-state";

export const BUILTIN_APPEARANCE_THEMES: readonly AppearanceThemeRecord[] = [
  {
    id: "miku-dream",
    name: "Miku 梦境",
    description: "粉蓝紫梦幻工作台，带首页横幅与柔和装饰",
  },
  {
    id: "pure-white",
    name: "纯白",
    description: "纯白极简外观，适合长时间工作",
  },
  {
    id: "pi-native",
    name: "Pi 原生",
    description: "保留 Pi 原生配色，可跟随系统明暗模式",
  },
];
