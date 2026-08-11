import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Score Admin",
  description: "Admin do monitoramento de parceiros",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}