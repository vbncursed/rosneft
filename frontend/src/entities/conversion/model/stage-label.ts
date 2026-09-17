const STAGE_LABELS: Record<string, string> = {
  fetching: "Fetching source",
  extracting: "Extracting archive",
  parsing: "Parsing OBJ + MTL",
  encoding: "Encoding geometry",
  compressing: "Compressing textures",
  registering: "Registering artifacts",
};

const LOD_STAGE = /^lod-(\d+)$/;

/**
 * Humanises the worker's coarse-grained `Job.stage` token for the upload and
 * content inspectors. The API carries no ETA for this side of the pipeline —
 * this is display text only. A token this list does not know is printed as
 * given, so a new worker phase reads as itself rather than disappearing.
 */
export function stageLabel(token: string | null): string {
  if (token === null) return "Queued";
  const lod = LOD_STAGE.exec(token);
  if (lod) return `Building LOD ${lod[1]}`;
  return STAGE_LABELS[token] ?? token;
}
