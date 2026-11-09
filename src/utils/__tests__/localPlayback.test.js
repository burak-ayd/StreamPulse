const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isLocalMediaUrl, localMediaExists } = require("../localPlayback");

test("httpAdresleriYerelDegil", () => {
	assert.equal(isLocalMediaUrl("https://cdn.example/x.m3u8"), false);
	assert.equal(isLocalMediaUrl("http://example.com/x.mp4"), false);
});

test("yerelYollarYerel", () => {
	assert.equal(isLocalMediaUrl("file:///data/user/0/app/x/master.m3u8"), true);
	assert.equal(isLocalMediaUrl("content://media/external/video/42"), true);
	assert.equal(isLocalMediaUrl("/data/user/0/app/x.mp4"), true);
});

test("bosDegerYerelDegil", () => {
	assert.equal(isLocalMediaUrl(""), false);
	assert.equal(isLocalMediaUrl(null), false);
	assert.equal(isLocalMediaUrl(undefined), false);
});

test("uzakAdresIcinDosyaKontroluYok", async () => {
	assert.equal(await localMediaExists("https://cdn.example/x.mp4"), true);
});
