import { ConsoleNav } from "./ui/console-nav";

export default (
  <div className="max-w-56">
    <ConsoleNav
      backHref="#"
      active="users"
      items={[
        { key: "users", label: "Users", href: "#" },
        { key: "roles", label: "Roles & Permissions", href: "#" },
        { key: "content", label: "Content", href: "#" },
        { key: "access", label: "Territory access", href: "#" },
        { key: "audit", label: "Audit journal", href: "#" },
        { key: "metrics", label: "Metrics", href: "#", disabled: true },
      ]}
    />
  </div>
);
