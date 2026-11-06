import type { ReactNode } from 'react';

export const metadata = {
  title: 'Audio Tours NY - Backend nuevo',
  description: 'Servicios backend de los modulos nuevos (2da mitad).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
