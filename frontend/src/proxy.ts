import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (req.cookies.has("session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except /login, /offline, the PWA icon routes, /api/*, Next
  // internals, and files with an extension.
  //
  // /offline обязан быть здесь: его отдаёт service worker, когда сети нет.
  // Попади он под matcher — редирект на /login, который без сети не грузится,
  // и вместо offline-экрана пользователь увидит белый.
  //
  // /icon и /apple-icon — тоже: браузер скачивает их анонимно, до всякой
  // сессии, чтобы решить, можно ли установить приложение. Расширения у них
  // нет, поэтому исключение `.*\..*` их не покрывает (в отличие от
  // /manifest.webmanifest), и без явного перечисления Chrome получает на них
  // редирект на /login и отказывается ставить приложение.
  matcher: [
    "/((?!login|offline|icon|apple-icon|api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
