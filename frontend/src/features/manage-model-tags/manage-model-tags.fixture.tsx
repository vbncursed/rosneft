import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelTagsCard } from "./ui/model-tags-card";

const TAGS = [
  { slug: "camps", title: "Camps" },
  { slug: "tanks", title: "Tanks" },
  { slug: "ungrouped", title: "Ungrouped" },
];

const seeded = () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["model-tags"], TAGS);
  return client;
};

export default {
  tags: (
    <QueryClientProvider client={seeded()}>
      <div className="p-6">
        <ModelTagsCard />
      </div>
    </QueryClientProvider>
  ),
};
