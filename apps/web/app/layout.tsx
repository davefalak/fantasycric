import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        <div className="page-shell">{children}</div>
      </body>
    </html>
  );
}
