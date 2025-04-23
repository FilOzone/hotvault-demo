import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/layout/client-layout";
import { GlobalUploadProgress } from "@/components/ui/global-upload-progress";
import { Toaster } from "sonner";

const dmSans = DM_Sans({ subsets: ["latin"] });
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hot Vault",
  description:
    "Hot Vault is a decentralized infrastructure for the next generation of web applications",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.className} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientLayout>
          {children}
          <GlobalUploadProgress />
        </ClientLayout>
        <Toaster richColors />
      </body>
    </html>
  );
}
