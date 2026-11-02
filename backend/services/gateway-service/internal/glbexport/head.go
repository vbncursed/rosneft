package glbexport

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"

	"github.com/qmuntal/gltf"
)

// ReadHead reads the GLB header, the JSON chunk and the next chunk's header,
// and stops there: the BIN data itself is never read.
func ReadHead(r io.Reader) (Head, error) {
	jsonLen, err := readPrelude(r)
	if err != nil {
		return Head{}, err
	}
	doc, err := readDocument(r, jsonLen)
	if err != nil {
		return Head{}, err
	}
	return readBinPosition(r, doc, jsonLen)
}

// readPrelude checks the GLB header and the first chunk's header, and returns
// the JSON chunk's length, which it has already held to maxJSONChunk.
func readPrelude(r io.Reader) (uint32, error) {
	var hdr [headerSize + chunkHeader]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return 0, malformed("header: %v", err)
	}
	if binary.LittleEndian.Uint32(hdr[0:]) != glbMagic {
		return 0, malformed("bad magic")
	}
	if v := binary.LittleEndian.Uint32(hdr[4:]); v != glbVersion {
		return 0, malformed("version %d", v)
	}
	jsonLen := binary.LittleEndian.Uint32(hdr[12:])
	if binary.LittleEndian.Uint32(hdr[16:]) != chunkJSON {
		return 0, malformed("first chunk is not JSON")
	}
	if jsonLen > maxJSONChunk {
		return 0, malformed("JSON chunk of %d bytes", jsonLen)
	}
	return jsonLen, nil
}

func readDocument(r io.Reader, jsonLen uint32) (*gltf.Document, error) {
	raw := make([]byte, jsonLen)
	if _, err := io.ReadFull(r, raw); err != nil {
		return nil, malformed("JSON chunk: %v", err)
	}
	doc := new(gltf.Document)
	if err := json.Unmarshal(raw, doc); err != nil {
		return nil, malformed("JSON chunk: %v", err)
	}
	return doc, nil
}

// readBinPosition reads the next chunk's header and, when it is the BIN
// chunk, says where its data starts and how long it is.
func readBinPosition(r io.Reader, doc *gltf.Document, jsonLen uint32) (Head, error) {
	h := Head{Doc: doc}
	var next [chunkHeader]byte
	switch _, err := io.ReadFull(r, next[:]); {
	case errors.Is(err, io.EOF): // no bytes at all: a GLB without BIN
	case err != nil:
		return Head{}, malformed("second chunk header: %v", err)
	case binary.LittleEndian.Uint32(next[4:]) == chunkBIN:
		h.BinOffset = int64(headerSize+chunkHeader+jsonLen) + chunkHeader
		h.BinLength = int64(binary.LittleEndian.Uint32(next[0:]))
	}
	return h, nil
}
