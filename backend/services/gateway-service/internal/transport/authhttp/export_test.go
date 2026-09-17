package authhttp

// RoutePerms exposes the gate table to the external spec guard, which cannot
// live in this package: it reads the spec through httpapi, and httpapi
// imports authhttp.
var RoutePerms = routePerms
