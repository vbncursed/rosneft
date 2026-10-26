-- +goose Up
-- +goose StatementBegin
-- PDF ↔ scene calibration point pairs (spec 2026-10-26 §7.3). Owned by
-- content-service, created here like every territory_documents change. PUT
-- replaces a document's whole set (2–20 points, one page) in one transaction;
-- deleting or replacing the PDF drops its points through the cascade.
CREATE TABLE document_calibration_points (
  document_id BIGINT NOT NULL REFERENCES territory_documents(id) ON DELETE CASCADE,
  idx SMALLINT NOT NULL CHECK (idx BETWEEN 0 AND 19),
  page SMALLINT NOT NULL CHECK (page >= 1),
  pdf_x DOUBLE PRECISION NOT NULL, pdf_y DOUBLE PRECISION NOT NULL, -- pt, top-left origin, y down (pdf.js viewport, scale 1, rotation 0)
  scene_x DOUBLE PRECISION NOT NULL, scene_y DOUBLE PRECISION NOT NULL, scene_z DOUBLE PRECISION NOT NULL,
  utm_e DOUBLE PRECISION, utm_n DOUBLE PRECISION,
  PRIMARY KEY (document_id, idx), CHECK ((utm_e IS NULL) = (utm_n IS NULL)));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE document_calibration_points;
-- +goose StatementEnd
