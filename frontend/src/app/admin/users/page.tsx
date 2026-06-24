import { listRoles } from "@/auth/infrastructure/auth-admin-gateway";
import UsersTable from "@/auth/presentation/console/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const roles = await listRoles();
  return <UsersTable roles={roles} />;
}
