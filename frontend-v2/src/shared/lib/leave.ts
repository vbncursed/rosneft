/**
 * A full navigation into the old SPA. Same origin, same cookie, so the
 * session rides along; a router navigate cannot reach those routes because
 * v2 does not have them.
 */
export const leaveTo = (href: string): void => window.location.assign(href);
