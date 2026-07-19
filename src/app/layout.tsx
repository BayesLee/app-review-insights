import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App 评论洞察 Agent",
  description: "将 App Store 评论转化为有证据支撑的版本计划、PRD 和测试用例。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
