const { test } = require("node:test");
const assert = require("node:assert/strict");
const { episodeMetaOf } = require("../contentMeta");

test("bolumKartiMetaDoldurur", () => {
	// Backend `series_name` / `season` / `episode` alanlarını doldurur.
	const meta = episodeMetaOf({
		title: "War 1.Sezon 1.Bölüm",
		series_name: "War",
		season: 1,
		episode: 1,
	});
	assert.deepEqual(meta, { seriesName: "War", season: 1, episode: 1 });
});

test("normalKartBolumKartiDegildir", () => {
	assert.equal(episodeMetaOf({ title: "The Matrix", year: "1999" }), null);
});

test("nullAlanlarBolumKartiSayilmaz", () => {
	// `Number(null)` → 0 olurdu; sezon/bölüm 0 da geçerli bir bölüm değil.
	assert.equal(episodeMetaOf({ title: "X", season: null, episode: null }), null);
	assert.equal(episodeMetaOf({ title: "X", season: 1, episode: null }), null);
});

test("seriesNameYoksaBasligaDuser", () => {
	const meta = episodeMetaOf({ title: "Halef S04E03", season: 4, episode: 3 });
	assert.equal(meta.seriesName, "Halef");
});
