/** The file a person saves: one code per line, ending with a newline. */
export const codesAsText = (codes: string[]) => `${codes.join("\n")}\n`;

/** Hands the browser a text file to save. */
export function downloadText(filename: string, text: string, doc: Document = document) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = filename;
  doc.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
