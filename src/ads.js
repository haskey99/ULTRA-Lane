let deathCount = 0;
const DEATH_LIMIT = 6;
const AD_ID = "ca-app-pub-9531394686837391/5445546132"; // your interstitial

export async function initAds() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
      const AdMob = window.Capacitor.Plugins.AdMob;
      await AdMob.initialize({ requestTrackingAuthorization: true, initializeForTesting: true });
      await AdMob.prepareInterstitial({ adId: AD_ID });
    }
  } catch (e) {
    console.log("AdMob init skipped", e);
  }
}

export async function onPlayerDied() {
  deathCount++;
  if (deathCount >= DEATH_LIMIT) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
        const AdMob = window.Capacitor.Plugins.AdMob;
        await AdMob.showInterstitial();
        // prepare next one
        await AdMob.prepareInterstitial({ adId: AD_ID });
      }
    } catch (e) {
      console.log("AdMob show failed", e);
    }
    deathCount = 0;
  }
}
