import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExportButton } from "./export-button";

const client = new QueryClient();

// The real button with its own QueryClient; a press fetches from the dev gateway.
export default {
  idle: (
    <QueryClientProvider client={client}>
      <div className="p-6">
        <ExportButton slug="ust-kut" />
      </div>
    </QueryClientProvider>
  ),
};
