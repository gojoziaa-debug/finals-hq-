/** Adresse hors de /fr et /en (le middleware redirige tout le reste) : page minimale. */
export default function RootNotFound() {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-bg p-6 text-text">
        <p>
          404 · <a href="/" className="underline">FINALS HQ</a>
        </p>
      </body>
    </html>
  );
}
