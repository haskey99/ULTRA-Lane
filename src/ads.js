import { AdMob, InterstitialAdPluginEvents } from '@capacitor-community/admob';

let deathCount = 0;

export async function initAds() {
  try {
    await AdMob.initialize();
    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      loadAd();
    });
    await loadAd();
  } catch(e){ console.log('AdMob init', e) }
}

async function loadAd() {
  try {
    await AdMob.prepareInterstitial({
      adId: 'ca-app-pub-3940256099942544/4411468910',
    });
  } catch(e){}
}

export async function onPlayerDied() {
  deathCount++;
  if (deathCount % 3 === 0) {
    try { await AdMob.showInterstitial(); } catch(e){}
  }
}
