import React from "react";
import type { SettingsSection } from "./settings-utils";

export interface SettingsNavItem {
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon?: React.ReactNode;
}

export const navigationItems: readonly SettingsNavItem[] = [
  { id: "appearance", label: "外观" },
  { id: "general", label: "通用" },
  { id: "providers", label: "提供商" },
  { id: "models", label: "模型" },
  { id: "development", label: "开发" },
  { id: "computer-use", label: "计算机操作" },
  { id: "notifications", label: "通知" },
  { id: "mobile-sync", label: "移动端同步" },
  {
    id: "dify",
    label: "Dify",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];
