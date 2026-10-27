import type { RefObject } from "react";
import type { Group } from "three";
import type { SiteProps } from "../ui/props";
import GroundProbe from "./ground-probe";
import PlanPreviewLayer from "./plan-preview-layer";
import ZonesLayer from "./zones-layer";

interface SiteLayersProps {
  site: SiteProps;
  /** Plain orbit only: a zone answers a click nowhere else. */
  interactive: boolean;
  /** Inside a panorama the photograph is the scene; neither layer is drawn. */
  hidden: boolean;
  unitRatio: number;
  color: string;
  territoryRef: RefObject<Group | null>;
}

/**
 * Everything the site-zones feature draws, and the probe that places it. It
 * sits beside the scene wrapper, never inside: the wrapper is what the walker
 * collides with and what Bounds frames. It reads nothing from the plan editor
 * or pdf.js: the zones are part of the viewer for every reader.
 */
export default function SiteLayers({ site, interactive, hidden, unitRatio, color, territoryRef }: SiteLayersProps) {
  return (
    <>
      <GroundProbe root={territoryRef} onReady={site.onGround} />
      {hidden ? null : (
        <>
          {site.showZones ? (
            <ZonesLayer
              zones={site.zones}
              unitRatio={unitRatio}
              color={color}
              interactive={interactive}
              selectedId={site.selectedZoneId}
              onSelect={site.onSelectZone}
            />
          ) : null}
          {site.preview ? (
            <PlanPreviewLayer preview={site.preview} unitRatio={unitRatio} color={color} interactive={interactive} />
          ) : null}
        </>
      )}
    </>
  );
}
