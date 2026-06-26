// Package fileheader sniffs file magic numbers. Used to reject blobs whose
// bytes don't match their declared content type before they reach BlobStore.
package fileheader

import "bytes"

// pdfMagic is the 5-byte signature every PDF starts with ("%PDF-").
var pdfMagic = []byte("%PDF-")

// IsPDF reports whether header begins with the PDF magic number. Pass at least
// the first 5 bytes of the file.
func IsPDF(header []byte) bool {
	return len(header) >= len(pdfMagic) && bytes.Equal(header[:len(pdfMagic)], pdfMagic)
}
