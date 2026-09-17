import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/card";
import type { ViewerErrorProps } from "../model/page-props";

/**
 * The card that stands in for a scene whose mesh never arrived.
 *
 * Every word comes from `errorCopy`, which reads the failure the canvas
 * reported — the level that actually failed, not the level that was asked for.
 * `role="alert"` comes from `ErrorState`, so the failure announces itself.
 */
export function ViewerError({ copy, onRetry, onCoarse }: ViewerErrorProps) {
  return (
    <ErrorState
      size="lg"
      icon="warning"
      title={copy.title}
      detail={copy.body}
      footer={copy.footer}
      action={
        <>
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          {onCoarse && copy.coarseLabel ? (
            <Button onClick={onCoarse}>{copy.coarseLabel}</Button>
          ) : null}
        </>
      }
    />
  );
}
