import { requirePermission } from "@/auth/application/require-permission";
import NewModelForm from "./new-model-form";

export const dynamic = "force-dynamic";

export default async function NewModelPage() {
  await requirePermission("model:write");
  return <NewModelForm />;
}
