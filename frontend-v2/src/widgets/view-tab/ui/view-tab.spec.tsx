import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CALIBRATION_LINE,
  DOCUMENTS_OVERLINE,
  EXIT_CALIBRATION,
  MARKERS_SWITCH,
  MOVE_POINTS,
  PANORAMAS_OVERLINE,
  UPLOAD_DOCUMENT_TITLE,
  UPLOAD_PANORAMA_TITLE,
  documentsCount,
  insideFooter,
} from "../model/copy";
import type { PanoramaRowView } from "./panorama-row";
import { ViewTab, type ViewTabProps } from "./view-tab";

const ROWS: PanoramaRowView[] = [
  {
    id: 7,
    title: "Control room, north door",
    thumbUrl: "/api/assets/a",
    active: false,
    calibrated: true,
    canEdit: false,
    editing: false,
  },
  {
    id: 8,
    title: "Pump house, south wall",
    thumbUrl: null,
    active: false,
    calibrated: false,
    canEdit: false,
    editing: false,
  },
];

const base = (): ViewTabProps => ({
  details: [
    { label: "slug", value: "refinery-block-c", tone: "accent" },
    { label: "units", value: "metres" },
  ],
  panoramas: {
    rows: ROWS,
    calibrating: null,
    canUpload: false,
    onUpload: vi.fn(),
    onEnter: vi.fn(),
    onExit: vi.fn(),
    onEdit: vi.fn(),
    showMarkers: true,
    onToggleMarkers: vi.fn(),
    onExitCalibration: vi.fn(),
    canMovePoints: false,
    moving: false,
    onToggleMove: vi.fn(),
    link: { url: undefined, canEdit: false, saving: false, onSave: vi.fn(async () => true) },
    editor: null,
  },
  documents: { rows: [{ id: 3, name: "plan-sheet-03.pdf" }], canUpload: false, onUpload: vi.fn() , onOpen: vi.fn() },
  footer: null,
});

const tab = (mutate: (p: ViewTabProps) => void = () => {}) => {
  const props = base();
  mutate(props);
  return { props, ...render(<ViewTab {...props} />) };
};

describe("ViewTab", () => {
  it("opens with the scene's own facts", () => {
    tab();
    expect(screen.getByText("slug")).toBeInTheDocument();
    expect(screen.getByText("refinery-block-c")).toBeInTheDocument();
  });

  it("heads each section with what it holds", () => {
    tab();
    expect(screen.getByText(PANORAMAS_OVERLINE)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(DOCUMENTS_OVERLINE)).toBeInTheDocument();
    expect(screen.getByText(documentsCount(1))).toBeInTheDocument();
  });

  it("lists the panoramas as the tour's picker", () => {
    const { container } = tab();
    const list = container.querySelector("ul[data-tour='panorama-picker']");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Control room, north door")).toBeInTheDocument();
  });

  it("opens a document by id", async () => {
    const { props } = tab();
    await userEvent.click(screen.getByRole("button", { name: "Open plan-sheet-03.pdf" }));
    expect(props.documents.onOpen).toHaveBeenCalledWith(3);
  });

  it("switches the in-scene markers", async () => {
    const { props, container } = tab();
    expect(container.querySelector("[data-tour='toggle-markers']")).not.toBeNull();
    const markers = screen.getByRole("switch", { name: MARKERS_SWITCH });
    expect(markers).toBeChecked();
    await userEvent.click(markers);
    expect(props.panoramas.onToggleMarkers).toHaveBeenCalled();
  });

  it("offers Move points only to a writer, and says whether it is on", async () => {
    tab();
    expect(screen.queryByRole("button", { name: MOVE_POINTS })).not.toBeInTheDocument();

    const { props, container } = tab((p) => {
      p.panoramas.canMovePoints = true;
      p.panoramas.moving = true;
    });
    const move = screen.getByRole("button", { name: MOVE_POINTS });
    expect(move).toHaveAttribute("aria-pressed", "true");
    expect(move).toHaveTextContent("V");
    expect(container.querySelector("[data-tour='move-points']")).not.toBeNull();
    await userEvent.click(move);
    expect(props.panoramas.onToggleMove).toHaveBeenCalled();
  });

  it("says how to calibrate while calibrating, and offers the way out", async () => {
    const { props } = tab((p) => {
      p.panoramas.calibrating = { title: "Control room, north door" };
    });
    expect(screen.getByText(CALIBRATION_LINE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(EXIT_CALIBRATION) }));
    expect(props.panoramas.onExitCalibration).toHaveBeenCalled();
  });

  it("draws no calibration notice when nothing is being calibrated", () => {
    tab();
    expect(screen.queryByText(CALIBRATION_LINE)).not.toBeInTheDocument();
  });

  it("renders the anchor editor under the rows", () => {
    tab((p) => {
      p.panoramas.editor = <p>anchor card</p>;
    });
    expect(screen.getByText("anchor card")).toBeInTheDocument();
  });

  it("offers both uploads to a writer and neither to a reader", async () => {
    tab();
    expect(screen.queryByRole("button", { name: UPLOAD_PANORAMA_TITLE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: UPLOAD_DOCUMENT_TITLE })).not.toBeInTheDocument();

    const { props } = tab((p) => {
      p.panoramas.canUpload = true;
      p.documents.canUpload = true;
    });
    await userEvent.click(screen.getByRole("button", { name: UPLOAD_PANORAMA_TITLE }));
    await userEvent.click(screen.getByRole("button", { name: UPLOAD_DOCUMENT_TITLE }));
    expect(props.panoramas.onUpload).toHaveBeenCalled();
    expect(props.documents.onUpload).toHaveBeenCalled();
  });

  it("keeps both heads when the lists are empty, so an upload has a home", () => {
    const { container } = tab((p) => {
      p.panoramas.rows = [];
      p.documents.rows = [];
      p.panoramas.canUpload = true;
      p.documents.canUpload = true;
    });
    expect(screen.getByText(PANORAMAS_OVERLINE)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(documentsCount(0))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: UPLOAD_PANORAMA_TITLE })).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("prints the footer it is given, and nothing when there is none", () => {
    tab();
    expect(screen.queryByText(insideFooter(2))).not.toBeInTheDocument();

    tab((p) => {
      p.footer = insideFooter(2);
    });
    expect(screen.getByText(insideFooter(2))).toBeInTheDocument();
  });
});
