const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
	kaliteMasterAdi,
	kaynakEtiketi,
	_sayaciSifirla,
} = require("../localHlsName");

const STRAIN =
	"https://s427.rapidrame.com/hls2/01/00033/5m9zp69o1dik_,l,.urlset/master.m3u8?t=aaa&f=169368";
const ENDGAME =
	"https://s231.rapidrame.com/hls2/01/00037/168z861obniu_,l,.urlset/master.m3u8?t=bbb&f=187340";

test("ayniIcerikIcinAdTekrarEtmez", () => {
	_sayaciSifirla();
	const a = kaliteMasterAdi(STRAIN);
	const b = kaliteMasterAdi(STRAIN);
	assert.notEqual(a, b, "aynı adres ikinci kez kullanılmamalı");
});

test("farkliIcerikFarkliEtiket", () => {
	_sayaciSifirla();
	assert.notEqual(kaynakEtiketi(STRAIN), kaynakEtiketi(ENDGAME));
});

test("adDosyaAdiOlarakGecerli", () => {
	_sayaciSifirla();
	const ad = kaliteMasterAdi(STRAIN);
	assert.match(ad, /^spd-q-[a-z0-9]+-[a-z0-9]+-\d+\.m3u8$/);
});

test("bosKaynakDaCalisir", () => {
	_sayaciSifirla();
	assert.match(kaliteMasterAdi(""), /^spd-q-[a-z0-9]+-[a-z0-9]+-\d+\.m3u8$/);
});