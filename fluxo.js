const campaignFlow = (() => {
  const key = 'camera-campaign-progress';

  function read() {
    try {
      return JSON.parse(sessionStorage.getItem(key)) ?? {};
    } catch {
      return {};
    }
  }

  function save(progress) {
    try {
      sessionStorage.setItem(key, JSON.stringify(progress));
    } catch {
      // The individual forms remain usable if session storage is unavailable.
    }
  }

  return { read, save };
})();
