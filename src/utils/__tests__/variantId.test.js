const { test } = require("node:test");
const assert = require("node:assert/strict");
const { variantId, pickVariant } = require("../variants");

const VARIANTS = [
	{ url: "v360", bandwidth: 1200000, resolution: "640x360" },
	{ url: "v720", bandwidth: 2800000, resolution: "1280x720" },
	{ url: "v1080", bandwidth: 5000000, resolution: "1920x1080" },
];

test("variantId", () => {
	assert.equal(variantId(VARIANTS[1]), "1280x720@2800000");
});

test("pickVariantSavedId", () => {
	assert.equal(pickVariant(VARIANTS, "1280x720@2800000").url, "v720");
});

test("pickVariantFallsBackToNearestBandwidth", () => {
	// kayıtlı id artık listede yok; 3 Mbit nearest → 2.8
	assert.equal(
		pickVariant(VARIANTS, "640x360@3000000").url,
		"v720",
	);
});

test("pickVariantFallsBackToHighest", () => {
	assert.equal(pickVariant(VARIANTS, "bilinecegi-sinif@0").url, "v1080");
	assert.equal(pickVariant([], "x@1"), null);
});
