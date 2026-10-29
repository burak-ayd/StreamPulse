const { test } = require("node:test");
const assert = require("node:assert/strict");
const { etaLabel } = require("../downloadEta");

const MB = 1024 * 1024;

test("saniyeCinsindenKalan", () => {
	assert.equal(
		etaLabel({ speedBps: MB, totalBytes: 50 * MB, downloadedBytes: 2 * MB }),
		"48 sn kaldı",
	);
});

test("dakikaCinsindenKalan", () => {
	assert.equal(
		etaLabel({ speedBps: MB, totalBytes: 130 * MB, downloadedBytes: 10 * MB }),
		"2 dk kaldı",
	);
});

test("saatCinsindenKalan", () => {
	assert.equal(
		etaLabel({ speedBps: MB, totalBytes: 9001 * MB, downloadedBytes: MB }),
		"2 sa 30 dk kaldı",
	);
});

test("hizYoksaTahminYok", () => {
	assert.equal(etaLabel({ speedBps: 0, totalBytes: 50 * MB }), null);
	assert.equal(etaLabel({ totalBytes: 50 * MB }), null);
});

test("boyutYoksaTahminYok", () => {
	assert.equal(etaLabel({ speedBps: MB }), null);
});

test("inenBittiIseTahminYok", () => {
	assert.equal(
		etaLabel({ speedBps: MB, totalBytes: 50 * MB, downloadedBytes: 50 * MB }),
		null,
	);
});
