import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App Review Insight Agent",
  description: "Turn App Store reviews into grounded version plans, PRDs, and test cases."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
