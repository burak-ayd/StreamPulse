const { test } = require("node:test");
const assert = require("node:assert/strict");
const { filterLibraryPayload } = require("../fieldWhitelist");

test("yerelUrlBulutaTasinmaz", () => {
	const payload = filterLibraryPayload({
		id: "odyssey",
		url: "file:///data/user/0/app/downloads/odyssey/master.m3u8",
		title: "Odyssey",
		currentTime: 120,
	});
	assert.equal(payload.url, undefined);
	// Konum/başlık gitmeye devam eder: yalnızca cihaza özel yol düşer.
	assert.equal(payload.id, "odyssey");
	assert.equal(payload.currentTime, 120);
});

test("sayfaAdresiKorunur", () => {
	const payload = filterLibraryPayload({
		id: "odyssey",
		url: "https://www.hdfilmcehennemi.nl/the-odyssey-3/",
	});
	assert.equal(payload.url, "https://www.hdfilmcehennemi.nl/the-odyssey-3/");
});
