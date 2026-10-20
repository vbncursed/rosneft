import { KeycapHint } from "@/shared/ui/keycap-hint";

/**
 * The orbit's keys, bottom right, while the Overlays panel is folded away (the
 * page decides when). F is the way into the free cam, and G — walking — is
 * explained inside it (`FreeCamKeys`), on its tile's tooltip and in the tour.
 * Static on purpose: nothing a key turns on animates.
 */
export function OrbitHints({ freeCam }: { freeCam: boolean }) {
  return (
    <div role="note" aria-label="Keyboard hints" className="absolute bottom-3.5 right-[74px] flex items-center gap-1.5">
      <KeycapHint keyLabel="M">measure</KeycapHint>
      {freeCam ? <KeycapHint keyLabel="F">free cam</KeycapHint> : null}
      <KeycapHint keyLabel="Esc">exit / deselect</KeycapHint>
    </div>
  );
}
