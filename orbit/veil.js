(function () {
  'use strict';

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9208 Chrome/136.0.7103.93 Electron/36.2.1 Safari/537.36';
  const APP = '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9208 Chrome/136.0.7103.93 Electron/36.2.1 Safari/537.36';

  const brands = Object.freeze([
    { brand: 'Not:A-Brand', version: '24' },
    { brand: 'Chromium', version: '136' },
    { brand: 'Google Chrome', version: '136' }
  ]);

  function cloak(obj, key, getter) {
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, key);
      if (desc && desc.configurable === false) return false;
      Object.defineProperty(obj, key, {
        get: getter,
        configurable: true
      });
      return true;
    } catch {
      return false;
    }
  }

  cloak(Navigator.prototype, 'userAgent', () => UA);
  cloak(Navigator.prototype, 'appVersion', () => APP);
  cloak(Navigator.prototype, 'platform', () => 'Win32');
  cloak(Navigator.prototype, 'vendor', () => 'Google Inc.');
  cloak(Navigator.prototype, 'maxTouchPoints', () => 0);
  cloak(Navigator.prototype, 'hardwareConcurrency', function () {
    return 8;
  });

  try {
    const uaData = navigator.userAgentData;
    if (uaData) {
      cloak(Object.getPrototypeOf(uaData), 'brands', () => brands.slice());
      cloak(Object.getPrototypeOf(uaData), 'mobile', () => false);
      cloak(Object.getPrototypeOf(uaData), 'platform', () => 'Windows');
      const proto = Object.getPrototypeOf(uaData);
      const originalHe = proto.getHighEntropyValues;
      if (typeof originalHe === 'function') {
        proto.getHighEntropyValues = async function () {
          const base = {
            architecture: 'x86',
            bitness: '64',
            brands: brands.slice(),
            fullVersionList: [
              { brand: 'Not:A-Brand', version: '10.0.0.4' },
              { brand: 'Chromium', version: '136.0.7103.93' },
              { brand: 'Google Chrome', version: '136.0.7103.93' }
            ],
            mobile: false,
            model: '',
            platform: 'Windows',
            platformVersion: '15.0.0',
            uaFullVersion: '136.0.7103.93',
            wow64: false
          };
          return base;
        };
      }
    }
  } catch {
    /* ignore */
  }
})();
