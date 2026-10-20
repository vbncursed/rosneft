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
	var hdr [headerSize + chunkHeader]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return Head{}, malformed("header: %v", err)
	}
	if binary.LittleEndian.Uint32(hdr[0:]) != glbMagic {
		return Head{}, malformed("bad magic")
	}
	if v := binary.LittleEndian.Uint32(hdr[4:]); v != glbVersion {
		return Head{}, malformed("version %d", v)
	}
	jsonLen := binary.LittleEndian.Uint32(hdr[12:])
	if binary.LittleEndian.Uint32(hdr[16:]) != chunkJSON {
		return Head{}, malformed("first chunk is not JSON")
	}
	if jsonLen > maxJSONChunk {
		return Head{}, malformed("JSON chunk of %d bytes", jsonLen)
	}
	raw := make([]byte, jsonLen)
	if _, err := io.ReadFull(r, raw); err != nil {
		return Head{}, malformed("JSON chunk: %v", err)
	}
	doc := new(gltf.Document)
	if err := json.Unmarshal(raw, doc); err != nil {
		return Head{}, malformed("JSON chunk: %v", err)
	}

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
