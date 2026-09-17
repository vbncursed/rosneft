import { describe, expect, it } from "vitest";
import { COPY, closeTitle, fileSize, modalTitle } from "./copy";

describe("the upload modal's copy", () => {
  it("names the dialog after the thing being added and the territory it joins", () => {
    expect(modalTitle("panorama", "Refinery Block C")).toBe("Add a panorama to Refinery Block C");
    expect(modalTitle("document", "Refinery Block C")).toBe("Add a document to Refinery Block C");
  });

  it("names the close button after the upload it abandons", () => {
    expect(closeTitle("panorama")).toBe("Close panorama upload");
    expect(closeTitle("document")).toBe("Close document upload");
  });

  it("asks for one equirect photo, and says what the file must be", () => {
    expect(COPY.panorama).toMatchObject({
      dropLabel: "Drop one equirectangular photo here",
      dropHint: "JPG or PNG · 2:1 ratio · single file",
      accept: ".jpg,.jpeg,.png",
      placeholder: "e.g. Pump house, south wall",
      submit: "Upload panorama",
      glyph: "panorama",
    });
  });

  it("asks for one PDF, and says where it will be shown", () => {
    expect(COPY.document).toMatchObject({
      dropLabel: "Drop one PDF here",
      dropHint: "PDF · single file · shown as a viewport overlay",
      accept: ".pdf",
      placeholder: "e.g. Fire safety zones",
      submit: "Upload document",
      glyph: "file",
    });
  });

  it("prints a file's size the way the card draws it — one decimal megabyte", () => {
    expect(fileSize(25_795_788)).toBe("24.6 MB");
  });

  it("falls back to the app's own size wording below a megabyte, where a decimal reads 0.0", () => {
    expect(fileSize(512 * 1024)).toBe("512 KB");
    expect(fileSize(0)).toBe("0 B");
  });
});
