import { useCallback, useState, type RefObject } from "react";
import type { Group } from "three";
import type { SiteProps } from "../ui/props";
import GroundProbe from "./ground-probe";
import PlanOverlay from "./plan-overlay";
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
 * collides with and what Bounds frames.
 */
export default function SiteLayers({ site, interactive, hidden, unitRatio, color, territoryRef }: SiteLayersProps) {
  const { onGround } = site;
  // The plan lies at the median ground height, known once the probe has run.
  const [groundY, setGroundY] = useState<number | null>(null);
  const ready = useCallback(
    (ground: Parameters<typeof onGround>[0]) => {
      setGroundY(ground.fallbackY);
      onGround(ground);
    },
    [onGround],
  );

  return (
    <>
      <GroundProbe root={territoryRef} onReady={ready} />
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
          {site.plan && groundY !== null ? (
            <PlanOverlay image={site.plan.image} fit={site.plan.fit} groundY={groundY} opacity={site.planOpacity} />
          ) : null}
        </>
      )}
    </>
  );
}
