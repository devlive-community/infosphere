package app

import (
	"testing"
	"time"
)

// TestCurrentReadingStreak 覆盖连续阅读天数的边界：空、连读、今天/昨天起算、断档。
func TestCurrentReadingStreak(t *testing.T) {
	// 以“今天中午”为锚点，避免临近午夜时 AddDate 跨日导致抖动。
	noon := analyticsDayStart(time.Now()).Add(12 * time.Hour)
	day := func(n int) time.Time { return noon.AddDate(0, 0, -n) }

	cases := []struct {
		name  string
		times []time.Time
		want  int
	}{
		{"empty", nil, 0},
		{"today only", []time.Time{day(0)}, 1},
		{"today+yesterday+2days", []time.Time{day(0), day(1), day(2)}, 3},
		{"yesterday only (today missing)", []time.Time{day(1)}, 1},
		{"gap breaks streak", []time.Time{day(0), day(2)}, 1},
		{"stale last read (2 days ago)", []time.Time{day(2), day(3)}, 0},
		{"duplicates same day", []time.Time{day(0), day(0), day(1)}, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := currentReadingStreak(tc.times); got != tc.want {
				t.Fatalf("currentReadingStreak(%v) = %d, want %d", tc.times, got, tc.want)
			}
		})
	}
}
