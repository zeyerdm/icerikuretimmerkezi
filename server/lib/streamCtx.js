// 8.4 Akış bağlamı: ?stream=1 ile gelen istekte AI çıktısı parça parça istemciye gider ve istemci iptal edebilir.
// Servisler değişmeden kalır; AI katmanı bağlamı buradan okur (onDelta: metin parçası, null: önizlemeyi sıfırla; signal: iptal).
import { AsyncLocalStorage } from 'node:async_hooks';

export const streamCtx = new AsyncLocalStorage();
export const currentStream = () => streamCtx.getStore() || {};
