const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPermissionRows } = require("../permissionRows");

test("sdk33HasNotificationsRow", () => {
	const rows = buildPermissionRows({ notifications: "granted" }, 33);
	const notifications = rows.find((r) => r.key === "notifications");
	assert.ok(notifications);
	assert.equal(notifications.required, true);
	assert.equal(notifications.status, "granted");
});

test("sdk28HasNoNotificationsRowAndStorageRequired", () => {
	const rows = buildPermissionRows({ storage: "denied" }, 28);
	assert.equal(rows.some((r) => r.key === "notifications"), false);
	const storage = rows.find((r) => r.key === "storage");
	assert.equal(storage.required, true);
	assert.equal(storage.status, "denied");
});

test("storageRowAlwaysPresent", () => {
	// Kullanıcı kararı: depolama izni her sürümde istenir (MediaStore yazımı
	// izinsiz de çalışsa satır görünür).
	const r29 = buildPermissionRows({}, 29).find((r) => r.key === "storage");
	assert.ok(r29);
	assert.equal(r29.required, false);
	assert.equal(r29.status, "denied");
	const r28 = buildPermissionRows({ storage: "granted" }, 28).find((r) => r.key === "storage");
	assert.equal(r28.required, true);
	assert.equal(r28.status, "granted");
});

test("mediaImagesOnlyOnSdk33Plus", () => {
	assert.equal(
		buildPermissionRows({}, 29).some((r) => r.key === "mediaImages"),
		false,
	);
	assert.ok(buildPermissionRows({ mediaImages: "denied" }, 33).find((r) => r.key === "mediaImages"));
});

test("optionalRowsAlwaysPresent", () => {
	const rows = buildPermissionRows({}, 33);
	for (const key of ["camera", "installPackages", "batteryOptimization"]) {
		const row = rows.find((r) => r.key === key);
		assert.ok(row, `${key} satırı olmalı`);
		assert.equal(row.required, false);
	}
});

test("missingStatusDefaultsToDenied", () => {
	const rows = buildPermissionRows({}, 33);
	assert.equal(
		rows.find((r) => r.key === "notifications").status,
		"denied",
	);
});
