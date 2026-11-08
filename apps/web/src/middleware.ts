import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { canonicalRedirect } from "./lib/site";

const intl = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const target = canonicalRedirect(request.headers.get("host"), request.nextUrl.pathname + request.nextUrl.search);
  if (target) return NextResponse.redirect(target, 308);
  return intl(request);
}

export const config = {
  // Tout sauf l'API, les fichiers internes de Next et les fichiers statiques.
  matcher: ["/((?!api|_next|_vercel|monitoring|.*\\..*).*)"],
};
