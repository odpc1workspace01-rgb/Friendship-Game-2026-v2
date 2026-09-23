/**
 * ODPC1 FRIENDSHIP GAMES 2026 - Database & Storage Module
 * Uses LocalStorage for structured text data and IndexedDB for images (team leaders, logo)
 */

const STORAGE_KEYS = {
  SETTINGS: 'odpc1_settings',
  TEAMS: 'odpc1_teams',
  GAMES: 'odpc1_games',
  SCORING: 'odpc1_scoring',
  RESULTS: 'odpc1_results',
  HISTORY: 'odpc1_history'
};

const DB_NAME = 'ODPC1FriendshipGamesDB';
const DB_VERSION = 1;
const STORE_AUDIO = 'audioFiles';
const STORE_IMAGES = 'images';
const OLD_DB_NAME = 'ODPC1_Games_DB';

// Open IndexedDB with automatic upgrade
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'audioId' });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('[Audio] IndexedDB open error:', request.error);
      reject(request.error);
    };
  });
}

// Initialize Audio Database
export async function initAudioDB() {
  try {
    const db = await openDB();
    console.log('[Audio] IndexedDB initialized:', db.name);
    return true;
  } catch (err) {
    console.error('[Audio] initAudioDB failed:', err);
    return false;
  }
}

/**
 * Save Audio File (Binary Blob + Metadata) to IndexedDB
 * @param {Object} audioItem { audioId, audioName, audioType, audioSize, audioCategory, audioBlob, uploadedAt, isDefault }
 */
export async function saveAudio(audioItem) {
  try {
    console.log('[Audio] Saving to IndexedDB:', audioItem.audioName || audioItem.audioId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      const store = tx.objectStore(STORE_AUDIO);
      store.put(audioItem);
      tx.oncomplete = () => {
        console.log('[Audio] Save success:', audioItem.audioId);
        resolve(true);
      };
      tx.onerror = () => {
        console.error('[Audio] Save failed:', tx.error);
        reject(tx.error);
      };
    });
  } catch (err) {
    console.error('[Audio] Error saving audio to IndexedDB:', err);
    return false;
  }
}

/**
 * Get single Audio by ID from IndexedDB
 */
export async function getAudio(audioId) {
  if (!audioId || audioId === 'default') return null;
  try {
    console.log('[Audio] Loading audio:', audioId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readonly');
      const store = tx.objectStore(STORE_AUDIO);
      const req = store.get(audioId);
      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => {
        console.error('[Audio] Error getting audio:', req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.error('[Audio] Error getting audio from IndexedDB:', err);
    return null;
  }
}

/**
 * Get all Audio items from IndexedDB, optionally filtered by category ('COUNTDOWN' | 'TIME_UP')
 */
export async function getAllAudio(category = null) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readonly');
      const store = tx.objectStore(STORE_AUDIO);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        if (category) {
          resolve(results.filter(item => item.audioCategory === category));
        } else {
          resolve(results);
        }
      };
      req.onerror = () => {
        console.error('[Audio] Error getting all audio:', req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.error('[Audio] Error getting all audio from IndexedDB:', err);
    return [];
  }
}

/**
 * Delete Audio from IndexedDB
 */
export async function deleteAudio(audioId) {
  try {
    console.log('[Audio] Deleting audio:', audioId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      const store = tx.objectStore(STORE_AUDIO);
      store.delete(audioId);
      tx.oncomplete = () => {
        console.log('[Audio] Audio deleted successfully:', audioId);
        resolve(true);
      };
      tx.onerror = () => {
        console.error('[Audio] Audio deletion failed:', tx.error);
        reject(tx.error);
      };
    });
  } catch (err) {
    console.error('[Audio] Error deleting audio from IndexedDB:', err);
    return false;
  }
}

// Aliases for backward compatibility
export const saveCustomAudio = saveAudio;
export const getCustomAudio = getAudio;
export const getAllCustomAudio = getAllAudio;
export const deleteCustomAudio = deleteAudio;

// Store image in IndexedDB (key: 'leader_yellow', 'leader_blue', 'logo', etc.)
export async function saveImage(key, dataUrl) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      store.put(dataUrl, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Error saving image to IndexedDB:', err);
    return false;
  }
}

// Get image from IndexedDB (with fallback to old DB if needed)
export async function getImage(key) {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;

    // Fallback: check old DB if present
    return new Promise((resolve) => {
      try {
        const oldReq = indexedDB.open(OLD_DB_NAME);
        oldReq.onsuccess = () => {
          const oldDb = oldReq.result;
          if (oldDb.objectStoreNames.contains('images')) {
            const tx = oldDb.transaction('images', 'readonly');
            const store = tx.objectStore('images');
            const req = store.get(key);
            req.onsuccess = () => {
              if (req.result) {
                // Copy to new DB for future reads
                saveImage(key, req.result).catch(() => {});
              }
              resolve(req.result || null);
            };
            req.onerror = () => resolve(null);
          } else {
            resolve(null);
          }
        };
        oldReq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (err) {
    console.error('Error getting image from IndexedDB:', err);
    return null;
  }
}

/**
 * Save Active App Logo (Binary Blob + Metadata) to IndexedDB
 * Entity: { logoId, logoName, logoBlob, logoType, dataUrl, uploadedAt }
 */
export async function saveAppLogo(file, dataUrl) {
  try {
    const logoData = {
      logoId: 'logo_' + Date.now(),
      logoName: file?.name || 'ODPC1_LOGO',
      logoBlob: file, // Store binary Blob/File directly in IndexedDB
      logoType: file?.type || 'image/png',
      dataUrl: dataUrl || '',
      uploadedAt: new Date().toISOString()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      store.put(logoData, 'appLogo');
      store.put(logoData, 'active_app_logo');
      if (dataUrl) {
        store.put(dataUrl, 'custom_logo');
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });

    console.log('[Logo] Successfully saved appLogo to IndexedDB:', logoData.logoName);
    return logoData;
  } catch (err) {
    console.error('[Logo] Error saving appLogo to IndexedDB:', err);
    return null;
  }
}

/**
 * Get Active App Logo from IndexedDB
 * Returns { logoId, logoName, logoBlob, logoType, url, dataUrl, uploadedAt }
 */
export async function getAppLogo() {
  try {
    const db = await openDB();
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      const req = store.get('appLogo');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (raw) {
      let objectUrl = '';
      if (raw.logoBlob instanceof Blob) {
        objectUrl = URL.createObjectURL(raw.logoBlob);
      } else if (raw.dataUrl) {
        objectUrl = raw.dataUrl;
      }
      return {
        logoId: raw.logoId || 'logo_primary',
        logoName: raw.logoName || 'ODPC1 Logo',
        logoBlob: raw.logoBlob,
        logoType: raw.logoType || 'image/png',
        url: objectUrl,
        dataUrl: raw.dataUrl || objectUrl,
        uploadedAt: raw.uploadedAt
      };
    }

    // Fallback check 'custom_logo'
    const legacy = await getImage('custom_logo');
    if (legacy) {
      return {
        logoId: 'legacy_logo',
        logoName: 'ODPC1 Logo',
        logoBlob: null,
        logoType: 'image/png',
        url: legacy,
        dataUrl: legacy,
        uploadedAt: new Date().toISOString()
      };
    }

    return null;
  } catch (err) {
    console.error('[Logo] Error getting appLogo from IndexedDB:', err);
    return null;
  }
}

// Get all images from IndexedDB (for export)
export async function getAllImages() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      const images = {};
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          images[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(images);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Error getting all images:', err);
    return {};
  }
}

// Clear all images
export async function clearAllImages() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Error clearing IndexedDB:', err);
  }
}

// Default initial data
export const DEFAULT_SETTINGS = {
  eventName: 'ODPC1 FRIENDSHIP GAMES 2026',
  eventDate: '18 กันยายน 2569',
  eventVenue: 'สนามกีฬา สำนักงานป้องกันควบคุมโรคที่ 1 เชียงใหม่',
  soundEnabled: true,
  animationEnabled: true,
  recorderName: 'คณะกรรมการบันทึกคะแนน',
  // Time Up Audio
  timeoutSoundEnabled: true,
  activeTimeoutAudioId: 'default',
  timeoutVolume: 0.8,
  // Countdown Audio
  countdownEnabled: true,
  countdownSoundEnabled: true,
  countdownDuration: 5,
  activeCountdownAudioId: 'default',
  countdownVolume: 0.8,
  // Backward compatibility keys
  timeUpSoundEnabled: true,
  timeUpAudioType: 'default',
  timeUpAudioVolume: 80
};

export const DEFAULT_SCORING = {
  rank1: 3,
  rank2: 2,
  rank3: 1,
  rank4: 1
};

export const DEFAULT_TEAMS = [
  {
    teamId: 'yellow',
    teamName: 'ทีมสีเหลือง',
    teamColor: '#EAB308',
    colorName: 'เหลือง',
    leaderName: 'นพ. วิทวัส พลังทอง',
    teamSlogan: 'เหลืองเรืองรอง สามัคคี มีวินัย มุ่งสู่ชัยชนะ'
  },
  {
    teamId: 'blue',
    teamName: 'ทีมสีน้ำเงิน',
    teamColor: '#2563EB',
    colorName: 'น้ำเงิน',
    leaderName: 'ดร. ศศิธร สายธารา',
    teamSlogan: 'น้ำเงินเกริกไกร พลังใจเป็นหนึ่งเดียว มิตรภาพยืนยง'
  },
  {
    teamId: 'red',
    teamName: 'ทีมสีแดง',
    teamColor: '#DC2626',
    colorName: 'แดง',
    leaderName: 'นายสรวิชญ์ สิงหราช',
    teamSlogan: 'เพลิงสีแดง แรงใจเต็มร้อย สู้ไม่ถอยเพื่อ ODPC1'
  },
  {
    teamId: 'purple',
    teamName: 'ทีมสีม่วง',
    teamColor: '#9333EA',
    colorName: 'ม่วง',
    leaderName: 'พญ. ชลิตา มงคลเลิศ',
    teamSlogan: 'ม่วงทรงพลัง สร้างสรรค์สามัคคี สปิริตนักกีฬา'
  }
];

export const DEFAULT_GAMES = [
  {
    gameId: 'game_1',
    order: 1,
    name: 'Kahoot',
    useTimer: true,
    durationSeconds: 600, // 10 minutes
    countdownSound: true,
    timeUpSound: true
  },
  {
    gameId: 'game_2',
    order: 2,
    name: 'ยิ่งสูงยิ่งหนาว ยิ่งนานยิ่งเหงา',
    useTimer: true,
    durationSeconds: 900, // 15 minutes
    countdownSound: true,
    timeUpSound: true
  },
  {
    gameId: 'game_3',
    order: 3,
    name: 'ราชาปลาเผา',
    useTimer: false,
    durationSeconds: 0,
    countdownSound: false,
    timeUpSound: false
  },
  {
    gameId: 'game_4',
    order: 4,
    name: 'รถไฟโยคะ',
    useTimer: true,
    durationSeconds: 600, // 10 minutes
    countdownSound: true,
    timeUpSound: true
  },
  {
    gameId: 'game_5',
    order: 5,
    name: 'ปิงปองโชว์',
    useTimer: false,
    durationSeconds: 0,
    countdownSound: false,
    timeUpSound: false
  },
  {
    gameId: 'game_6',
    order: 6,
    name: 'ฮอมก้าวฮอมบุญ',
    useTimer: true,
    durationSeconds: 1200, // 20 minutes
    countdownSound: true,
    timeUpSound: true
  }
];

// Clean initial competition results for production event (All 4 teams start clean at 0 points)
export const DEFAULT_TEST_RESULTS = {};
export const DEFAULT_HISTORY = [];

// Helper to get from LocalStorage
export function loadFromStorage(key, defaultVal) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultVal;
  } catch (e) {
    console.error(`Error loading ${key}:`, e);
    return defaultVal;
  }
}

// Helper to save to LocalStorage
export function saveToStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
}
