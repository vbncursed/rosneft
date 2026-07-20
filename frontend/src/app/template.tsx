import type { ReactNode } from "react";

// A route-transition wrapper. Unlike layout.tsx, Next.js re-mounts template.tsx
// on every navigation, so this fades each new page in. Pages are viewport-sized
// (h-screen / min-h-screen), so the extra wrapper div doesn't affect layout.
//
// The fade is a CSS animation rather than a motion.div on purpose: motion's
// initial state renders as an inline opacity: 0 that only clears once the
// client bundle hydrates. Whenever JS does not arrive — offline, a failed
// chunk — every page stayed transparent, which read as a blank screen. CSS
// animates without JS, and the resting state here is visible.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
