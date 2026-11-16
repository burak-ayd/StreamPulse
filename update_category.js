const fs = require('fs');
let content = fs.readFileSync('src/app/(app)/category.jsx', 'utf8');

const oldProps = `getItemLayout={getItemLayout}
						onScrollToIndexFailed={onScrollToIndexFailed}
						onScroll={rememberScroll.onScroll}
						scrollEventThrottle={rememberScroll.scrollEventThrottle}
						onContentSizeChange={() =>
							rememberScroll.restoreOffset(listRef)
						}
						onEndReached={loadMore}
						onEndReachedThreshold={0.4}
						ListFooterComponent={footer}
						showsVerticalScrollIndicator={false}
						initialNumToRender={12}
						maxToRenderPerBatch={8}
						/*
						 * SORUN 2 — \`windowSize\` büyütüldü.
						 *
						 * 5 pencerelik kısa pencere, TV'de kumandayla hızlı
						 * gezinirken ölçülmemiş satırların boş kalmasına
						 * ("içerik değişti" hissi) yol açıyordu. 9 pencerenin
						 * maliyeti ihmal edilebilir, kazanımı belirgin.
						 */
						windowSize={9}
						/*
						 * SORUN 2 — \`removeClippedSubviews\` KAPALI.
						 *
						 * Android'de kırpma, ekran dışına çıkan hücreyi
						 * native tarafta DETACH eder. Odaklı kart detache
						 * olursa kumanda odağı düşer ve Android listedeki
						 * başka bir öğeye odaklanır — kullanıcının gördüğü
						 * tam olarak "seçilmiş içerik kendiliğinden değişti"
						 * davranışıdır.
						 *
						 * TV'de zaten kesinlikle kapatılmalıydı; ızgara
						 * hücrelerinin bellek maliyeti makul olduğu için
						 * telefon/ tablette de kapalı bırakıldı.
						 */
						removeClippedSubviews={false}`;

const newProps = `onScrollToIndexFailed={onScrollToIndexFailed}
						onScroll={rememberScroll.onScroll}
						scrollEventThrottle={rememberScroll.scrollEventThrottle}
						onContentSizeChange={() =>
							rememberScroll.restoreOffset(listRef)
						}
						onEndReached={loadMore}
						onEndReachedThreshold={0.4}
						ListFooterComponent={footer}
						showsVerticalScrollIndicator={false}
						estimatedItemSize={cardStride}
						drawDistance={Platform.isTV ? 600 : 300}
						overrideItemLayout={(layout) => {
							layout.size = cardStride;
						}}`;

content = content.replace(oldProps, newProps);

fs.writeFileSync('src/app/(app)/category.jsx', content);
console.log('Updated FlashList props for category');