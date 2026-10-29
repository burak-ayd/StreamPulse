const { test } = require("node:test");
const assert = require("node:assert/strict");
const { matchesResumeEntry } = require("../resumeMatch");

test("seriesEpisodesDoNotShareResume", () => {
	const entry = { id: "lupin", season: 1, episode: 3, currentTime: 900 };
	assert.equal(
		matchesResumeEntry(entry, { contentId: "lupin", season: 1, episode: 4 }),
		false,
	);
});

test("sameEpisodeMatches", () => {
	const entry = { id: "lupin", season: 1, episode: 3, currentTime: 900 };
	assert.equal(
		matchesResumeEntry(entry, { contentId: "lupin", season: 1, episode: 3 }),
		true,
	);
});

test("movieIgnoresSeasonEpisode", () => {
	const entry = { id: "m1", url: "http://v/film.m3u8", currentTime: 60 };
	assert.equal(
		matchesResumeEntry(entry, {
			contentId: "m1",
			season: 7,
			episode: 9,
		}),
		true,
	);
});

test("urlMismatchInSeriesFails", () => {
	const entry = {
		id: "s1",
		url: "http://v/ep1.m3u8",
		season: 2,
		episode: 1,
	};
	assert.equal(
		matchesResumeEntry(entry, { url: "http://v/ep2.m3u8", season: 2, episode: 1 }),
		false,
	);
});

test("seriesTitleChannelForLegacyLocalFiles", () => {
	// İçerik kimliği taşmayan eski kayıt (dizi adı + sezon/bölüm) yerel dosya
	// açılışında eşleşir (madde 11 — İndirilenler'den oynatma).
	const entry = { id: "old-url", seriesTitle: "Lupin", season: 4, episode: 4, currentTime: 900 };
	assert.equal(
		matchesResumeEntry(entry, {
			seriesTitle: "Lupin",
			season: 4,
			episode: 4,
		}),
		true,
	);
	assert.equal(
		matchesResumeEntry(entry, { seriesTitle: "Lupin", season: 4, episode: 5 }),
		false,
	);
});

test("urlMatchesSeriesEpisodes", () => {
	const entry = {
		id: "s1",
		url: "http://v/ep1.m3u8",
		season: 2,
		episode: 1,
	};
	assert.equal(
		matchesResumeEntry(entry, { url: "http://v/ep1.m3u8", season: 2, episode: 1 }),
		true,
	);
});
