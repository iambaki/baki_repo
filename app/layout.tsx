import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PTAT · Product Testing & Verification",
  description:
    "A controlled workspace for business UAT, product purchase verification and BSS evidence.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
