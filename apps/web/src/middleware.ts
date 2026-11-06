import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Tout sauf l'API, les fichiers internes de Next et les fichiers statiques.
  matcher: ["/((?!api|_next|_vercel|monitoring|.*\\..*).*)"],
};
