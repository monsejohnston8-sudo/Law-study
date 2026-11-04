import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Casebook",
  description: "A private, source-aware law school study workspace",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
