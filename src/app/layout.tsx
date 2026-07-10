import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bóveda API",
  description: "Billetera digital — backend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
