/*
 * ПОЛКА · сканер штрихкодов и QR.
 * Камера включается только по кнопке. На Android и в Chrome кадры разбирает
 * встроенный BarcodeDetector, на iPhone и в остальных браузерах — локальный
 * декодер ZXing (assets/vendor/zxing.min.js), который грузится лениво.
 * Никаких сетевых запросов, кроме собственного файла приложения.
 */

const ZXING_URL = 'assets/vendor/zxing.min.js';
const NATIVE_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93',
  'itf', 'qr_code', 'data_matrix', 'aztec', 'pdf417', 'codabar'
];
const SCAN_INTERVAL = 280;

let zxingPromise = null;

export function isScannerSupported() {
  return Boolean(
    window.isSecureContext &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingPromise) return zxingPromise;

  zxingPromise = new Promise(function (resolve, reject) {
    const script = document.createElement('script');
    script.src = ZXING_URL;
    script.async = true;
    script.onload = function () {
      if (window.ZXing) resolve(window.ZXing);
      else reject(new Error('ZXing не загрузился'));
    };
    script.onerror = function () { reject(new Error('Не удалось загрузить декодер')); };
    document.head.appendChild(script);
  });

  zxingPromise.catch(function () { zxingPromise = null; });
  return zxingPromise;
}

function cameraReason(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'unavailable';
  return 'failed';
}

function cameraMessage(error) {
  const reason = cameraReason(error);
  if (reason === 'denied') return 'Нет доступа к камере. Разрешите камеру в настройках браузера или введите код вручную.';
  if (reason === 'unavailable') return 'Камера не найдена. Введите код вручную.';
  if (error && error.name === 'NotReadableError') return 'Камера занята другим приложением. Закройте его и попробуйте снова.';
  return 'Не получилось включить камеру. Введите код вручную.';
}

export function createScanner(options) {
  const video = options.video;
  const onStatus = options.onStatus || function () {};
  const onResult = options.onResult || function () {};
  const onError = options.onError || function () {};

  let stream = null;
  let detector = null;
  let reader = null;
  let timer = null;
  let stopped = true;
  let finished = false;

  async function start() {
    if (!stopped) return;
    stopped = false;
    finished = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (error) {
      stopped = true;
      onError(cameraMessage(error), cameraReason(error));
      return;
    }

    if (stopped) {
      stopStream();
      return;
    }

    onStatus('Ищем код в кадре…');

    if ('BarcodeDetector' in window) {
      const native = await startNative();
      if (native) return;
    }
    if (stopped) {
      stopStream();
      return;
    }
    await startZXing();
  }

  async function nativeFormats() {
    try {
      if (typeof window.BarcodeDetector.getSupportedFormats !== 'function') return NATIVE_FORMATS;
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const known = NATIVE_FORMATS.filter(function (format) {
        return supported.indexOf(format) !== -1;
      });
      return known.length ? known : NATIVE_FORMATS;
    } catch (error) {
      return NATIVE_FORMATS;
    }
  }

  async function startNative() {
    try {
      detector = new window.BarcodeDetector({ formats: await nativeFormats() });
    } catch (error) {
      detector = null;
    }
    if (!detector) return false;

    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');
    try { await video.play(); } catch (error) { /* кадр появится без автозапуска */ }
    if (stopped) return true;

    tickNative();
    return true;
  }

  function tickNative() {
    if (stopped) return;
    timer = window.setTimeout(function () {
      if (stopped || !detector) return;
      detector.detect(video).then(function (codes) {
        if (stopped) return;
        if (codes && codes.length) {
          finish(codes[0].rawValue, codes[0].format);
          return;
        }
        tickNative();
      }).catch(function () {
        if (!stopped) tickNative();
      });
    }, SCAN_INTERVAL);
  }

  async function startZXing() {
    onStatus('Загружаем декодер…');

    let ZXing = null;
    try {
      ZXing = await loadZXing();
    } catch (error) {
      stopped = true;
      stopStream();
      onError('Не получилось загрузить декодер. Проверьте интернет и попробуйте ещё раз.', 'failed');
      return;
    }
    if (stopped) {
      stopStream();
      return;
    }

    try {
      reader = new ZXing.BrowserMultiFormatReader();
      onStatus('Ищем код в кадре…');
      reader.decodeFromStream(stream, video, function (result) {
        if (stopped || !result) return;
        const format = result.getBarcodeFormat ? String(result.getBarcodeFormat()) : '';
        finish(result.getText(), format);
      }).catch(function () {
        if (stopped) return;
        stopped = true;
        stopStream();
        onError('Сканер не запустился. Введите код вручную.', 'failed');
      });
    } catch (error) {
      stopped = true;
      stopStream();
      onError('Сканер не запустился. Введите код вручную.', 'failed');
    }
  }

  function finish(text, format) {
    if (finished || stopped) return;
    finished = true;
    stop();
    onResult(String(text || ''), format || '');
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    if (video) {
      try { video.pause(); } catch (error) { /* уже остановлено */ }
      video.srcObject = null;
    }
  }

  function stop() {
    stopped = true;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    detector = null;
    if (reader) {
      try { reader.stopContinuousDecode(); } catch (error) { /* уже остановлен */ }
      try { reader.reset(); } catch (error) { /* уже остановлен */ }
      reader = null;
    }
    stopStream();
  }

  return { start: start, stop: stop };
}
