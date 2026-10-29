const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
	resolvePluginName,
	normalizePluginValue,
	MIRROR_PLUGIN_PREFIXES,
} = require("../pluginName");

test("pluginFieldWins", () => {
	assert.equal(resolvePluginName({ plugin: "dizibox" }), "dizibox");
	assert.equal(
		resolvePluginName({ plugin: "hdfilmcehennemi", url: "https://s231.lol/x" }),
		"hdfilmcehennemi",
	);
});

test("mirrorPrefixInPluginFieldIsCorrected", () => {
	// Hatalı kayıt: yansı alan adı eklenti adı olarak saklanmış (madde 5).
	assert.equal(resolvePluginName({ plugin: "s231" }), "hdfilmcehennemi");
});

test("mirrorPrefixMapsToRealPlugin", () => {
	assert.equal(resolvePluginName({ url: "https://s231.lol/dizi/lupin" }), "hdfilmcehennemi");
	assert.equal(resolvePluginName({ url: "https://s231xxx.lol/dizi/x" }), "hdfilmcehennemi");
	assert.equal(resolvePluginName({ id: "https://s231abc.com/film/y" }), "hdfilmcehennemi");
	assert.ok(Array.isArray(MIRROR_PLUGIN_PREFIXES));
});

test("knownNamesStillResolved", () => {
	assert.equal(resolvePluginName({ url: "https://www.dizibox.pro/d/x" }), "dizibox");
	assert.equal(resolvePluginName({ url: "https://hdfilmcehennemi.co/x" }), "hdfilmcehennemi");
});

test("unknownHostReturnsNullNoGuess", () => {
	assert.equal(resolvePluginName({ url: "https://ornek-mirror.example.com/x" }), null);
	assert.equal(resolvePluginName({ url: "https://s231-ornek.example.com/x" }), "hdfilmcehennemi");
});

test("emptyReturnsNull", () => {
	assert.equal(resolvePluginName(null), null);
	assert.equal(resolvePluginName({}), null);
});

test("normalizePluginValueBadges", () => {
	// Case-insensitive: "S231" yazımlı eski kayıt eşleşmeli (Tur 12).
	assert.equal(resolvePluginName({ plugin: "S231" }), "hdfilmcehennemi");
	assert.equal(resolvePluginName({ plugin: "S231xxx" }), "hdfilmcehennemi");
	// Bilinmeyen ad korunmalı (davranış değişmesin).
	assert.equal(resolvePluginName({ plugin: "BilinmeyenSite" }), "BilinmeyenSite");
	// Rozet/listeler için ham adın çözülmesi.
	assert.equal(normalizePluginValue("S231"), "hdfilmcehennemi");
	assert.equal(normalizePluginValue(undefined), null);
	assert.equal(normalizePluginValue("BilinmeyenSite"), "BilinmeyenSite");
});

test("emptyReturnsNull", () => {
	assert.equal(resolvePluginName(null), null);
	assert.equal(resolvePluginName({}), null);
});
