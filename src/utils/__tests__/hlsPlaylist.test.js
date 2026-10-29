const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
	resolveUrl,
	parseMasterPlaylist,
	parseMediaPlaylist,
} = require("../hlsPlaylist");

const MASTER_TEXT = [
	"#EXTM3U",
	'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="Türkçe",LANGUAGE="tr",DEFAULT=YES,URI="audio_1.m3u8"',
	'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="İngilizce",LANGUAGE="en",URI="audio_2.m3u8"',
	'#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1",AUDIO="audio0"',
	"video_720.m3u8",
	'#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360',
	"video_360.m3u8",
].join("\n");

test("masterListsVariants", () => {
	const { variants, audioTracks } = parseMasterPlaylist(
		MASTER_TEXT,
		"http://t/master.m3u8",
	);
	assert.equal(variants.length, 2);
	assert.equal(audioTracks.length, 2);
	assert.equal(variants[0].bandwidth, 2800000);
	assert.equal(variants[0].resolution, "1280x720");
	assert.equal(variants[0].audioGroup, "audio0");
	assert.deepEqual(
		audioTracks.map((t) => t.language),
		["tr", "en"],
	);
	assert.equal(audioTracks[0].isDefault, true);
	assert.equal(audioTracks[1].isDefault, false);
});

test("relativeUrls", () => {
	const { variants, audioTracks } = parseMasterPlaylist(
		MASTER_TEXT,
		"http://t/dir/master.m3u8",
	);
	assert.equal(variants[0].url, "http://t/dir/video_720.m3u8");
	assert.equal(audioTracks[0].url, "http://t/dir/audio_1.m3u8");
	assert.equal(resolveUrl("http://t/dir/master.m3u8", "/root/x.m3u8"), "http://t/root/x.m3u8");
	assert.equal(resolveUrl("http://t/dir/master.m3u8", "https://other/z"), "https://other/z");
});

test("mediaSegments", () => {
	const text = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:4",
		'#EXT-X-KEY:METHOD=AES-128,URI="k"',
		"#EXTINF:4.001,",
		"s1.ts",
	].join("\n");
	const p = parseMediaPlaylist(text, "http://t/media.m3u8");
	assert.equal(p.encrypted, true);
	assert.equal(p.totalDuration, 4.001);
	assert.equal(p.segments.length, 1);
	assert.equal(p.segments[0].url, "http://t/s1.ts");

	const fmp4 = parseMediaPlaylist(
		'#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\ns1.m4s\n',
		"http://t/media.m3u8",
	);
	assert.equal(fmp4.isFmp4, true);
	assert.equal(fmp4.segments[0].init, true);
	assert.equal(fmp4.segments.length, 2);
});
