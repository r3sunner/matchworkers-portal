


import "./globals.css";

import "../app/globals.css";

import { Open_Sans } from "next/font/google";
import AppShell from "@/app/components/layouts/AppShell";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
});

export const metadata = {
  title: "MatchWorkers Job Portal",
  description: "Job Portal by Match Workers",
};


export default function RootLayout({ children }) {
  return (
    <html lang="en" >
      <body className={openSans.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}