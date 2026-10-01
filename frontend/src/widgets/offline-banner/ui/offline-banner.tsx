import { useOnline } from "@/shared/lib/use-online";
import { Callout } from "@/shared/ui/callout";

/** The banner's face, apart from the connectivity read, so a fixture can draw it. */
export function OfflineNotice() {
  return (
    <div role="status" className="sticky top-0 z-30">
      <Callout tone="warn" className="rounded-none">
        Offline — showing saved data
      </Callout>
    </div>
  );
}

/** One line across the top while the desktop shell is answering from its saved copy. */
export function OfflineBanner() {
  return useOnline() ? null : <OfflineNotice />;
}
