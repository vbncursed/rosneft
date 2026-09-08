import type { AuditEntry } from "@/entities/audit";
import type { JobCardModel } from "@/entities/conversion";
import type { ModelCardModel } from "@/entities/model";
import type { TerritoryCardModel } from "@/entities/territory";
import { CatalogShell } from "@/widgets/catalog-shell";
import { STATIC_HINTS, type ConsoleKey } from "./model/console-hints";
import type { ConsoleCardProps } from "./ui/console-card";
import { HomePage, type HomePageProps } from "./ui/home-page";

const TRAILING = {
  ready: { label: "Open →", tone: "accent" },
  converting: { label: "converting", tone: "muted" },
  failed: { label: "unavailable", tone: "muted" },
  pending: { label: "pending", tone: "muted" },
} as const;

const territory = (
  slug: string,
  title: string,
  status: TerritoryCardModel["status"],
  description: string,
): TerritoryCardModel => ({
  slug,
  title,
  description,
  status,
  chips: [],
  trailing: TRAILING[status],
  panorama: false,
});

const model = (slug: string, title: string, usageCount: number): ModelCardModel => ({
  slug,
  title,
  status: "ready",
  thumbnailUrl: null,
  usageCount,
  size: "—",
  lods: "—",
  trailing:
    usageCount > 0
      ? { label: `in ${usageCount} territories`, tone: "accent" }
      : { label: "unused", tone: "muted" },
});

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const entry = (
  id: number,
  action: string,
  at: string,
  entityLabel = "",
  territorySlug = "",
): AuditEntry => ({
  id,
  at,
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action,
  entity: "",
  entityId: "",
  entityLabel,
  territorySlug,
  oldRow: null,
  newRow: null,
  result: "ok",
});

const open = (key: string, label: string, text: string): ConsoleCardProps => ({
  label,
  href: `/console/${key}`,
  hint: { kind: "count", text },
  locked: false,
});

const locked = (key: ConsoleKey, label: string): ConsoleCardProps => ({
  label,
  href: `/console/${key}`,
  hint: { kind: "static", text: STATIC_HINTS[key] },
  locked: true,
});

const TERRITORIES = [
  territory("refinery-block-c", "Refinery Block C", "converting", "Distillation towers, tank farm and pipe racks."),
  territory("north-ridge-pad", "North Ridge Pad", "ready", "Wellhead cluster and gathering lines."),
  territory("tank-farm-south", "Tank Farm South", "ready", "Twelve storage tanks with bunds and walkways."),
  territory("pipe-rack-b7", "Pipe Rack B7", "failed", "Source archive rejected by the worker."),
];

const MODELS = [
  model("pump-jack-unit", "Pump Jack Unit", 6),
  model("storage-tank-500", "Storage Tank 500", 4),
  model("valve-assembly", "Valve Assembly", 2),
  model("pipe-rack-segment", "Pipe Rack Segment", 9),
  model("control-cabin", "Control Cabin", 0),
];

const JOBS: JobCardModel[] = [
  {
    kind: "territory",
    slug: "refinery-block-c",
    title: "Refinery Block C",
    href: "/territories/refinery-block-c",
    status: "converting",
    meta: "territory · refinery-block-c · building LOD 1",
    percent: 58,
  },
  {
    kind: "territory",
    slug: "pipe-rack-b7",
    title: "Pipe Rack B7",
    href: "/territories/pipe-rack-b7",
    status: "failed",
    meta: "territory · pipe-rack-b7 · stopped while compressing textures",
    error: "ktx2: unsupported pixel format in tank_albedo_04.tga",
  },
];

// Live shapes from GET /api/audit/mine: auth rows carry no label and no territory.
// Three rows follow the clock so the "HH:MM" and "yesterday" forms are always
// on screen; the oldest is a fixed instant, because "dd.mm HH:MM" is the one
// form a relative offset cannot pin — it would read differently every day.
const ACTIVITY = [
  entry(4, "auth.login", ago(3)),
  entry(3, "territory.replace_source", ago(18), "", "refinery-block-c"),
  entry(2, "model.create", ago(20), "Valve Assembly"),
  entry(1, "placement.update", "2026-06-14T11:37:00Z", "Pump Jack Unit", "north-ridge-pad"),
];

const CONSOLE_OPEN = [
  open("users", "Users", "12 users · 1 frozen"),
  open("roles", "Roles & Permissions", "3 roles · 24 permissions"),
  open("content", "Content", "4 territories · 57 models"),
  open("access", "Territory access", "6 grants"),
  open("audit", "Audit journal", "184 events · 24h"),
  open("metrics", "Metrics", "2 alerts firing"),
];

const CONSOLE_EDITOR = [
  locked("users", "Users"),
  locked("roles", "Roles & Permissions"),
  open("content", "Content", "4 territories · 57 models"),
  locked("access", "Territory access"),
  locked("audit", "Audit journal"),
  locked("metrics", "Metrics"),
];

const noop = () => {};

const base: HomePageProps = {
  meta: "4 territories · 57 models · 1 converting · 1 failed",
  canUploadTerritory: true,
  canUploadModel: true,
  onUploadTerritory: noop,
  onUploadModel: noop,
  jobs: JOBS,
  jobsMeta: "2 jobs · updates by itself",
  territories: { cards: TERRITORIES, total: 4, meta: "showing 4 of 4", viewerEmpty: false },
  models: { cards: MODELS, total: 57, meta: "57 in the library" },
  console: CONSOLE_OPEN,
  activity: ACTIVITY,
  activityLoading: false,
  onOpen: noop,
};

const page = (over: Partial<HomePageProps>) => (
  <CatalogShell>
    <HomePage {...base} {...over} />
  </CatalogShell>
);

const QUIET = { jobs: [], jobsMeta: "0 jobs", meta: "4 territories · 57 models · nothing converting" };

export default {
  owner: page({}),
  quiet: page(QUIET),
  editor: page({ ...QUIET, console: CONSOLE_EDITOR }),
  viewerEmpty: page({
    meta: "0 territories assigned · read-only access",
    canUploadTerritory: false,
    canUploadModel: false,
    jobs: [],
    territories: { cards: [], total: 0, meta: "assigned to you", viewerEmpty: true },
    models: null,
    console: null,
  }),
  guestActivity: page({ activity: null }),
  activityEmpty: page({ activity: [] }),
  moreThanFits: page({
    territories: { ...base.territories, total: 12, meta: "showing 4 of 12" },
    models: { ...base.models!, total: 8, meta: "8 in the library" },
  }),
};
