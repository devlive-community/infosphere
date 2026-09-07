// Package webbundle exposes the Next.js standalone runtime embedded at build time.
package webbundle

import (
	"embed"
	"io/fs"
)

const archivePath = "assets/web-runtime.tar.gz"

// assets always contains README.txt so ordinary Go builds and tests work without
// first building the web application. Release builds add web-runtime.tar.gz.
//
//go:embed assets
var assets embed.FS

// Open returns the embedded web runtime archive. fs.ErrNotExist means this is a
// development/API-only build and callers should keep the placeholder web route.
func Open() (fs.File, error) {
	return assets.Open(archivePath)
}
