// Every one of the 22 routes used to render the same <title>, because nothing
// in the app ever set one: open three territories and you get three
// indistinguishable tabs, history entries and bookmarks.
//
// TanStack renders `{ title }` inside a route's `meta` as the document <title>,
// and the deepest matched route wins — so a child overrides its layout without
// the layout knowing. `<HeadContent />` in the root route is what puts the tags
// on the page; React 19 hoists them into <head> on its own.
const SITE = "Andrey";

export function titleMeta(page?: string) {
  return { meta: [{ title: page ? `${page} · ${SITE}` : SITE }] };
}
