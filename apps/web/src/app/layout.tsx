import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Betterprompting",
  description:
    "Open-source analytics and prompt-optimization layer for AI coding tools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <a href="/" className="brand">
            betterprompting
          </a>
          <div className="nav-links">
            <a href="/">Dashboard</a>
            <a href="/events">Events</a>
            <a href="/setup">Setup</a>
            <a
              href="https://github.com/sangmeshcp/betterprompting"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
