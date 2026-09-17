import { ConsoleSidebar } from "./ui/console-sidebar";

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

const viewer = { username: "a.ivanova", roleTitle: "Company Owner" };

// Beside a tall column, so the sticky behaviour is visible: the sidebar holds
// its place while the page scrolls past it.
export default (
  <div className="grid min-h-dvh grid-cols-[236px_minmax(0,1fr)] bg-bg">
    <ConsoleSidebar items={NAV} active="users" backHref="#" viewer={viewer} />
    <div className="flex flex-col gap-3 p-8">
      {Array.from({ length: 40 }, (_, i) => (
        <p key={i} className="m-0 rounded-control border border-line bg-panel px-4 py-3 text-[13px] text-muted">
          Row {i + 1} — scroll to see the column hold its place.
        </p>
      ))}
    </div>
  </div>
);
