import { Component, createElement, Suspense, type ReactNode } from "react";
import type { ZoneEditFormProps } from "@/features/zone-editor";
import { notify } from "@/shared/lib/notify";
import { Skeleton } from "@/shared/ui/skeleton";
import { resetZoneEdit, zoneEditForm } from "./zone-edit-chunk";

/** The form's own shape, so the card does not go blank while the chunk loads. */
function Placeholder() {
  return (
    <div role="status" aria-label="Opening the editor" className="flex flex-col gap-3">
      <Skeleton width="100%" height="38px" rounded="md" />
      <Skeleton width="45%" height="12px" />
      <Skeleton width="70%" height="12px" />
      <Skeleton width="60%" height="12px" />
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The edit form inside the card: a placeholder while it loads, and the read view back with a toast if it cannot. */
export function ZoneEditSlot(props: ZoneEditFormProps) {
  return (
    <Boundary
      onError={() => {
        resetZoneEdit();
        notify.error("Could not open the editor. Try again.");
        props.onDone();
      }}
    >
      <Suspense fallback={<Placeholder />}>{createElement(zoneEditForm(), props)}</Suspense>
    </Boundary>
  );
}
