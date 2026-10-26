import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { HttpError } from "@/shared/api";
import { ZoneForm } from "./zone-form";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "pumps", title: "Pumps" },
  { slug: "cranes", title: "Cranes" },
  { slug: "ungrouped", title: "Ungrouped" },
];

function Frame({ children, seed }: { children: React.ReactNode; seed: boolean }) {
  const [client] = useState(() => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (seed) c.setQueryData(["model-tags"], TAGS);
    return c;
  });
  return (
    <QueryClientProvider client={client}>
      <div className="w-[340px] p-6">{children}</div>
    </QueryClientProvider>
  );
}

export default {
  "rectangle picked": (
    <Frame seed>
      <ZoneForm rectName="Rectangle 7.5 × 13.0 m" canPlace onCreate={async () => {}} />
    </Frame>
  ),
  "no rectangle yet": (
    <Frame seed>
      <ZoneForm rectName={null} canPlace={false} onCreate={async () => {}} />
    </Frame>
  ),
  "rectangle with no area": (
    <Frame seed>
      <ZoneForm
        rectName="Rectangle 0.0 × 0.0 m"
        canPlace
        blocked="This rectangle has no area."
        onCreate={async () => {}}
      />
    </Frame>
  ),
  "title already taken": (
    <Frame seed>
      <ZoneForm
        rectName="Rectangle 7.5 × 13.0 m"
        canPlace
        onCreate={() => Promise.reject(new HttpError(400, null, "a zone titled Tank row already exists"))}
      />
    </Frame>
  ),
};
