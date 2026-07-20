import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.cookies.has("session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except /login, /offline, /api/*, Next internals, and files with an extension.
  //
  // /offline обязан быть здесь: его отдаёт service worker, когда сети нет.
  // Попади он под matcher — редирект на /login, который без сети не грузится,
  // и вместо offline-экрана пользователь увидит белый.
  matcher: ["/((?!login|offline|api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
