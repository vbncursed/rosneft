import { ConsoleSidebar } from "./ui/console-sidebar";

export default (
  <div className="h-dvh w-59">
    <ConsoleSidebar
      backHref="#"
      active="users"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
      items={[
        { key: "users", label: "Users", href: "#" },
        { key: "roles", label: "Roles & Permissions", href: "#" },
        { key: "content", label: "Content", href: "#" },
        { key: "access", label: "Territory access", href: "#" },
        { key: "audit", label: "Audit journal", href: "#" },
        { key: "metrics", label: "Metrics", href: "#" },
      ]}
    />
  </div>
);
