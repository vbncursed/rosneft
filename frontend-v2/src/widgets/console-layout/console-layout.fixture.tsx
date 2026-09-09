import { ConsoleLayout } from "./ui/console-layout";

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

export default (
  <ConsoleLayout
    items={NAV}
    active="users"
    backHref="#"
    viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
  >
    <h1 className="m-0 text-[34px] font-bold tracking-[-0.025em]">Page content</h1>
    {Array.from({ length: 24 }, (_, i) => (
      <p key={i} className="m-0 rounded-control border border-line bg-panel px-4 py-3 text-[13px] text-muted">
        Row {i + 1} — the column beside this holds its place.
      </p>
    ))}
  </ConsoleLayout>
);
