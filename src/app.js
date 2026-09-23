/**
 * ODPC1 FRIENDSHIP GAMES 2026 - Main Application Logic
 * Kahoot Live Ranking + Modern Sports Event + Game Show Redesign
 */
import {
  saveImage,
  getImage,
  getAllImages,
  clearAllImages,
  saveAppLogo,
  getAppLogo,
  saveAudio,
  getAudio,
  getAllAudio,
  deleteAudio,
  saveCustomAudio,
  getCustomAudio,
  getAllCustomAudio,
  deleteCustomAudio,
  initAudioDB,
  DEFAULT_SETTINGS,
  DEFAULT_SCORING,
  DEFAULT_TEAMS,
  DEFAULT_GAMES,
  DEFAULT_TEST_RESULTS,
  DEFAULT_HISTORY,
  loadFromStorage,
  saveToStorage
} from './db.js';

import {
  getAudioEnabled,
  setAudioEnabled,
  unlockAudio,
  playCountdownStep,
  playCountdownBeep,
  playGoSound,
  playTimeUpSound,
  playAudioBlob,
  playWarningTick,
  playCelebrationFanfare,
  playRankStinger,
  previewAudio,
  stopCurrentPreview,
  stopAllAudio,
  validateAudioFile
} from './audio.js';

import { DEFAULT_LEADER_AVATARS } from './avatars.js';

// Application State
const rawSavedSettings = loadFromStorage('odpc1_settings', DEFAULT_SETTINGS);

// Sanitize initial results: Purge legacy sample/demo competition results so event starts at 0
function getCleanInitialResults() {
  const savedResults = loadFromStorage('odpc1_results', DEFAULT_TEST_RESULTS);
  const savedHistory = loadFromStorage('odpc1_history', DEFAULT_HISTORY);

  // Check if saved data contains sample/demo records
  const hasSampleHistory = Array.isArray(savedHistory) && savedHistory.some(h =>
    h && (h.resultId === 'res_sample_1' || h.resultId === 'res_sample_2' || h.resultId === 'res_sample_3' || (typeof h.resultId === 'string' && h.resultId.startsWith('res_sample_')))
  );

  const keys = savedResults ? Object.keys(savedResults) : [];
  const isSampleResults = hasSampleHistory || (
    keys.length === 3 &&
    keys.includes('game_1') &&
    keys.includes('game_2') &&
    keys.includes('game_3') &&
    Array.isArray(savedResults['game_1']) &&
    savedResults['game_1'][0]?.points === 3 &&
    savedResults['game_1'][0]?.teamId === 'yellow'
  );

  if (isSampleResults) {
    console.log('[Competition Data] Purging sample/demo results. Starting clean with 0 scores.');
    saveToStorage('odpc1_results', {});
    saveToStorage('odpc1_history', []);
    return { results: {}, history: [] };
  }

  return {
    results: (savedResults && typeof savedResults === 'object') ? savedResults : {},
    history: Array.isArray(savedHistory) ? savedHistory : []
  };
}

const initialResultsData = getCleanInitialResults();

let appState = {
  settings: {
    ...DEFAULT_SETTINGS,
    ...rawSavedSettings,
    // Normalization & Backward Compatibility
    timeoutSoundEnabled: rawSavedSettings.timeoutSoundEnabled !== undefined ? rawSavedSettings.timeoutSoundEnabled : (rawSavedSettings.timeUpSoundEnabled !== false),
    activeTimeoutAudioId: rawSavedSettings.activeTimeoutAudioId || rawSavedSettings.timeUpAudioType || 'default',
    timeoutVolume: typeof rawSavedSettings.timeoutVolume === 'number' ? rawSavedSettings.timeoutVolume : (typeof rawSavedSettings.timeUpAudioVolume === 'number' ? (rawSavedSettings.timeUpAudioVolume > 1 ? rawSavedSettings.timeUpAudioVolume / 100 : rawSavedSettings.timeUpAudioVolume) : 0.8),
    countdownEnabled: rawSavedSettings.countdownEnabled !== false,
    countdownSoundEnabled: rawSavedSettings.countdownSoundEnabled !== false,
    countdownDuration: parseInt(rawSavedSettings.countdownDuration, 10) || 5,
    activeCountdownAudioId: rawSavedSettings.activeCountdownAudioId || 'default',
    countdownVolume: typeof rawSavedSettings.countdownVolume === 'number' ? rawSavedSettings.countdownVolume : 0.8
  },
  scoring: loadFromStorage('odpc1_scoring', DEFAULT_SCORING),
  teams: loadFromStorage('odpc1_teams', DEFAULT_TEAMS),
  games: loadFromStorage('odpc1_games', DEFAULT_GAMES),
  results: initialResultsData.results,
  history: initialResultsData.history,
  currentLeaderId: null,
  previousScores: {},
  activeGameId: 'game_1',
  timerState: {
    status: 'STOPPED', // STOPPED, COUNTDOWN, RUNNING, PAUSED, TIME_UP
    remainingSeconds: 600,
    intervalId: null
  },
  leaderImages: {},
  customLogoUrl: null
};

// Initialize app
export async function initApp() {
  // Sync Audio Setting & Init IndexedDB
  setAudioEnabled(appState.settings.soundEnabled);
  await initAudioDB();

  // Load Images from IndexedDB
  for (const team of appState.teams) {
    const imgData = await getImage(`leader_${team.teamId}`);
    if (imgData) {
      appState.leaderImages[team.teamId] = imgData;
    }
  }

  // Load Single Source of Truth Logo from IndexedDB
  try {
    const savedLogo = await getAppLogo();
    if (savedLogo && (savedLogo.url || savedLogo.dataUrl)) {
      appState.customLogoUrl = savedLogo.url || savedLogo.dataUrl;
    } else {
      const legacyLogo = await getImage('custom_logo');
      if (legacyLogo) {
        appState.customLogoUrl = legacyLogo;
      }
    }
  } catch (err) {
    console.warn('[Logo] Error loading custom logo:', err);
  }
  updateAllLogos(appState.customLogoUrl);

  // Record initial scores for animation delta tracking
  const initialStandings = calculateStandings();
  initialStandings.forEach(t => {
    appState.previousScores[t.teamId] = t.totalScore;
  });
  if (initialStandings[0] && initialStandings[0].totalScore > 0) {
    appState.currentLeaderId = initialStandings[0].teamId;
  } else {
    appState.currentLeaderId = null;
  }

  // Set default active game timer
  const initialGame = appState.games.find(g => g.gameId === appState.activeGameId) || appState.games[0];
  if (initialGame && initialGame.useTimer) {
    appState.timerState.remainingSeconds = initialGame.durationSeconds || 600;
  }

  // Start Real-time Clock
  startRealtimeClock();

  // Render Everything
  renderHeader();
  renderHeroArea();
  renderTeamRankingCards();
  renderScoreProgressionBars();
  renderMatrixTable();
  renderTimerWidget();
  setupEventListeners();
  updateShowModeView();
}

// Real-time Clock updater
function startRealtimeClock() {
  function tick() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
    const clockEls = document.querySelectorAll('.live-clock-display');
    clockEls.forEach(el => {
      el.textContent = timeStr;
    });
  }
  tick();
  setInterval(tick, 1000);
}

// Calculate team points, rank, and games played
export function calculateStandings() {
  const standings = appState.teams.map(team => {
    let totalScore = 0;
    let gamesPlayed = 0;

    Object.keys(appState.results).forEach(gameId => {
      const gameResults = appState.results[gameId];
      if (Array.isArray(gameResults)) {
        const teamResult = gameResults.find(r => r.teamId === team.teamId);
        if (teamResult) {
          totalScore += Number(teamResult.points || 0);
          gamesPlayed++;
        }
      }
    });

    return {
      ...team,
      totalScore,
      gamesPlayed,
      rank: 1
    };
  });

  // Sort descending by score
  standings.sort((a, b) => b.totalScore - a.totalScore);

  // Assign ranks with tie handling
  let currentRank = 1;
  for (let i = 0; i < standings.length; i++) {
    if (i > 0 && standings[i].totalScore < standings[i - 1].totalScore) {
      currentRank = i + 1;
    }
    standings[i].rank = currentRank;
  }

  return standings;
}

// Update state and detect leader changes
export function updateLeaderboardData() {
  const standings = calculateStandings();
  const leader = standings[0];

  const hasLeaderChanged = leader && leader.totalScore > 0 && appState.currentLeaderId && appState.currentLeaderId !== leader.teamId;

  if (hasLeaderChanged) {
    triggerGameShowLeaderChange(leader);
  }

  if (leader && leader.totalScore > 0) {
    appState.currentLeaderId = leader.teamId;
  } else {
    appState.currentLeaderId = null;
  }
  return { standings, hasLeaderChanged };
}

// Exciting Game Show Leader Change Animation (1.5 - 2s)
function triggerGameShowLeaderChange(newLeader) {
  const overlay = document.getElementById('lead-change-gameshow-overlay');
  const titleEl = document.getElementById('lead-change-step-title');
  const portraitEl = document.getElementById('lead-change-portrait-img');
  const teamEl = document.getElementById('lead-change-team-name');
  const leaderEl = document.getElementById('lead-change-leader-name');
  const scoreEl = document.getElementById('lead-change-score-tag');

  if (!overlay) return;

  // Sound stinger & overlay open
  playCelebrationFanfare();
  overlay.classList.add('active');

  const avatarSrc = appState.leaderImages[newLeader.teamId] || DEFAULT_LEADER_AVATARS[newLeader.teamId] || DEFAULT_LEADER_AVATARS.yellow;

  // Phase 1: CALCULATING...
  if (titleEl) titleEl.textContent = '⚙️ CALCULATING SCORES...';
  if (teamEl) teamEl.textContent = 'ประมวลผลอันดับผู้นำใหม่...';
  if (leaderEl) leaderEl.textContent = '';
  if (scoreEl) scoreEl.textContent = '';

  setTimeout(() => {
    // Phase 2: RANKING UPDATED!
    if (titleEl) titleEl.textContent = '⚡ RANKING UPDATED!';
    playCountdownBeep(880);

    setTimeout(() => {
      // Phase 3: 👑 LEAD CHANGE!
      if (titleEl) titleEl.textContent = '👑 LEAD CHANGE • ผู้นำอันดับ 1 เปลี่ยนใหม่!';
      if (portraitEl) portraitEl.src = avatarSrc;
      if (teamEl) {
        teamEl.textContent = newLeader.teamName;
        teamEl.style.color = newLeader.teamColor;
      }
      if (leaderEl) leaderEl.textContent = `หัวหน้าทีม: ${newLeader.leaderName}`;
      if (scoreEl) scoreEl.textContent = `คะแนนรวม: ${newLeader.totalScore} แต้ม (ขึ้นสู่อันดับ 1)`;
      playGoSound();

      // Auto close after 2 seconds
      setTimeout(() => {
        overlay.classList.remove('active');
      }, 2200);
    }, 600);
  }, 600);
}

// Single Source of Truth for App Logo across ALL pages and overlays
export function updateAllLogos(logoUrl) {
  const finalLogo = logoUrl || appState.customLogoUrl || '/logo.svg';

  // 1. App Header Logo
  const headerLogo = document.getElementById('header-logo');
  if (headerLogo) headerLogo.src = finalLogo;

  // 2. Show Mode 16:9 Logo
  const showLogo = document.getElementById('show-mode-logo');
  if (showLogo) showLogo.src = finalLogo;

  // 3. Fullscreen Dedicated Timer Logo
  const fsLogo = document.getElementById('fs-timer-logo');
  if (fsLogo) fsLogo.src = finalLogo;

  // 4. Settings Preview Logo
  const settingPreview = document.getElementById('setting-logo-preview');
  if (settingPreview) settingPreview.src = finalLogo;

  // 5. Query all elements with brand logo classes
  document.querySelectorAll('.brand-logo-source, .show-mode-logo-img, .fs-timer-logo, .brand-logo-img').forEach(img => {
    if (img && img.src !== finalLogo) {
      img.src = finalLogo;
    }
  });

  // 6. Favicon
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon && finalLogo) {
    favicon.href = finalLogo;
  }
}

// Render Header
function renderHeader() {
  updateAllLogos(appState.customLogoUrl);
  const titleEl = document.getElementById('header-title');
  if (titleEl) {
    titleEl.textContent = appState.settings.eventName;
  }
  const subEl = document.getElementById('header-subtitle');
  if (subEl) {
    subEl.innerHTML = `<span>📅 ${appState.settings.eventDate}</span> • <span>📍 ${appState.settings.eventVenue}</span>`;
  }
  const audioBtn = document.getElementById('btn-toggle-sound');
  if (audioBtn) {
    audioBtn.innerHTML = appState.settings.soundEnabled ? '🔊 เสียง: เปิด' : '🔇 เสียง: ปิด';
  }
}

// Render Hero Area
function renderHeroArea() {
  const totalGames = appState.games.length;
  const playedGames = Object.keys(appState.results).length;
  const percent = totalGames > 0 ? Math.round((playedGames / totalGames) * 100) : 0;

  const roundBadge = document.getElementById('hero-round-badge');
  if (roundBadge) {
    roundBadge.textContent = `แข่งขันแล้ว ${playedGames} / ${totalGames} เกม (${percent}%)`;
  }
}

// Get Leader Portrait URL (Uploaded photo OR High-Res Vector SVG)
function getLeaderPortraitSrc(team) {
  return appState.leaderImages[team.teamId] || DEFAULT_LEADER_AVATARS[team.teamId] || DEFAULT_LEADER_AVATARS.yellow;
}

// Render 4 Hero Team Cards (Kahoot / Game Show Style)
function renderTeamRankingCards() {
  const grid = document.getElementById('team-ranking-grid');
  if (!grid) return;

  const standings = calculateStandings();
  const maxScore = Math.max(...standings.map(s => s.totalScore), 1);

  grid.innerHTML = standings.map((team, index) => {
    // Only the single team at index 0 (top of standings) gets the CURRENT LEADER highlight if score > 0
    const isCurrentLeader = index === 0 && team.totalScore > 0;
    const portraitSrc = getLeaderPortraitSrc(team);

    let rankBadgeHTML = '';
    if (team.rank === 1) {
      rankBadgeHTML = `<span class="rank-gold">🥇 #${team.rank}</span>`;
    } else if (team.rank === 2) {
      rankBadgeHTML = `<span class="rank-silver">🥈 #${team.rank}</span>`;
    } else if (team.rank === 3) {
      rankBadgeHTML = `<span class="rank-bronze">🥉 #${team.rank}</span>`;
    } else {
      rankBadgeHTML = `<span class="rank-fourth">⭐ #${team.rank}</span>`;
    }

    const currentLeaderBadge = isCurrentLeader
      ? `<div class="current-leader-badge">👑 CURRENT LEADER • ผู้นำอันดับ 1</div>`
      : '';

    const scorePercent = Math.min(Math.round((team.totalScore / maxScore) * 100), 100);

    return `
      <div class="ranking-card ${isCurrentLeader ? 'is-champion' : ''}" 
           id="card-${team.teamId}" 
           style="--card-team-color: ${team.teamColor}; --card-team-glow: ${team.teamColor}50;">
        
        ${currentLeaderBadge}

        <!-- 1. RANK + MEDAL (Priority 2) & Games Played -->
        <div class="card-rank-header">
          <div class="rank-number-display">${rankBadgeHTML}</div>
          <div class="games-played-badge">แข่ง ${team.gamesPlayed}/${appState.games.length} เกม</div>
        </div>

        <!-- 2. LEADER IMAGE (Priority 1 - VISUAL HERO 40-45% OF CARD) -->
        <div class="leader-image-stage">
          <img src="${portraitSrc}" alt="${team.leaderName}" class="leader-portrait-img" id="img-leader-${team.teamId}" />
          <!-- Floating Score Popup -->
          <div class="floating-score-popup" id="float-score-${team.teamId}">+0</div>
        </div>

        <!-- 3. TEAM NAME & 4. LEADER NAME (Priority 4 & 5) -->
        <div class="card-names-block">
          <div class="team-name-title">${team.teamName}</div>
          <div class="leader-name-heading" title="${team.leaderName}">
            <span class="leader-prefix">ผู้นำ:</span> ${team.leaderName}
          </div>
        </div>

        <!-- 5. TOTAL SCORE (Priority 3 - 42-60px) -->
        <div class="card-score-footer">
          <div class="score-display-row">
            <span class="score-counter-number" id="score-val-${team.teamId}">${team.totalScore}</span>
            <span class="score-points-unit">POINTS</span>
          </div>
          <div class="score-points-label">คะแนนสะสม</div>
          <div class="card-score-mini-track">
            <div class="card-score-mini-fill" style="width: ${Math.max(scorePercent, 8)}%;"></div>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

// Render Horizontal Kahoot-Style Score Progression Bars
// [ RANK ICON ] [ LEADER AVATAR 64-90px ] [ TEAM NAME ] [ LEADER NAME ] [ SCORE BAR 18-26px ] [ TOTAL SCORE ]
function renderScoreProgressionBars() {
  const container = document.getElementById('score-bars-list');
  if (!container) return;

  const standings = calculateStandings();
  const maxScore = Math.max(...standings.map(s => s.totalScore), 12);

  container.innerHTML = standings.map(team => {
    const widthPercent = Math.max((team.totalScore / maxScore) * 100, 6);
    const portraitSrc = getLeaderPortraitSrc(team);

    let rankBadge = `#${team.rank}`;
    if (team.rank === 1) rankBadge = '🥇';
    else if (team.rank === 2) rankBadge = '🥈';
    else if (team.rank === 3) rankBadge = '🥉';
    else rankBadge = '⭐';

    return `
      <div class="score-bar-row" style="--bar-team-color: ${team.teamColor}; --bar-team-glow: ${team.teamColor}50;">
        <!-- 1. RANK ICON -->
        <div class="score-bar-rank-badge" style="color: ${team.teamColor};">${rankBadge}</div>
        
        <!-- 2. LEADER AVATAR (64-90px) -->
        <div class="score-bar-leader-avatar">
          <img src="${portraitSrc}" alt="${team.leaderName}" />
        </div>

        <!-- 3. TEAM NAME & 4. LEADER NAME -->
        <div class="score-bar-team-info">
          <div class="score-bar-team-title">${team.teamName}</div>
          <div class="score-bar-leader-sub" title="${team.leaderName}">ผู้นำ: ${team.leaderName}</div>
        </div>
        
        <!-- 5. SCORE BAR PROGRESSION (Height 18-26px) -->
        <div class="score-bar-track-wrap">
          <div class="score-bar-fill-bar" 
               id="bar-fill-${team.teamId}"
               style="width: ${widthPercent}%; background: linear-gradient(90deg, ${team.teamColor}99 0%, ${team.teamColor} 100%);">
          </div>
        </div>

        <!-- 6. TOTAL SCORE -->
        <div class="score-bar-points-numeric">
          ${team.totalScore} <span class="points-unit-sub">แต้ม</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render Matrix Table for Jury / Operations
function renderMatrixTable() {
  const table = document.getElementById('matrix-score-table');
  if (!table) return;

  const totals = {};
  appState.teams.forEach(t => { totals[t.teamId] = 0; });

  const rowsHTML = appState.games.map((game, idx) => {
    const gameResult = appState.results[game.gameId];
    const isRecorded = Array.isArray(gameResult);

    const cellsHTML = appState.teams.map(team => {
      if (!isRecorded) {
        return `<td style="color:#64748b;">-</td>`;
      }
      const tr = gameResult.find(r => r.teamId === team.teamId);
      if (!tr) return `<td style="color:#64748b;">-</td>`;

      totals[team.teamId] += Number(tr.points || 0);

      let badge = '';
      if (tr.rank === 1) badge = `<span style="color:#facc15; font-weight:800;">🥇 ที่ 1 (+${tr.points})</span>`;
      else if (tr.rank === 2) badge = `<span style="color:#e2e8f0; font-weight:800;">🥈 ที่ 2 (+${tr.points})</span>`;
      else if (tr.rank === 3) badge = `<span style="color:#fdba74; font-weight:800;">🥉 ที่ 3 (+${tr.points})</span>`;
      else badge = `<span style="color:#94a3b8;">4 ที่ 4 (+${tr.points})</span>`;

      return `<td>${badge}</td>`;
    }).join('');

    const statusAction = isRecorded
      ? `<button class="btn btn-secondary" style="font-size:0.8rem; padding:5px 10px;" onclick="window.openScoreModal('${game.gameId}')">✏️ แก้ไข</button>`
      : `<button class="btn btn-primary" style="font-size:0.8rem; padding:5px 10px;" onclick="window.openScoreModal('${game.gameId}')">➕ บันทึก</button>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#ffffff;">${idx + 1}. ${game.name}</div>
          <div style="font-size:0.8rem; color:#94a3b8;">${game.useTimer ? '⏱️ มีจับเวลา' : 'ไม่มีจับเวลา'}</div>
        </td>
        ${cellsHTML}
        <td>${statusAction}</td>
      </tr>
    `;
  }).join('');

  const totalsCellsHTML = appState.teams.map(team => {
    return `<td style="font-size:1.4rem; font-weight:900; color:${team.teamColor};">${totals[team.teamId]}</td>`;
  }).join('');

  table.innerHTML = `
    <thead>
      <tr>
        <th>รายการแข่งขัน</th>
        ${appState.teams.map(t => `<th style="color:${t.teamColor};">${t.teamName}</th>`).join('')}
        <th>จัดการ</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
      <tr style="background:rgba(255,255,255,0.06); font-weight:900;">
        <td style="color:#38bdf8; font-size:1.1rem;">รวมคะแนนทั้งหมด</td>
        ${totalsCellsHTML}
        <td></td>
      </tr>
    </tbody>
  `;
}

// Render Timer Widget
function renderTimerWidget() {
  const panel = document.getElementById('active-timer-panel');
  if (!panel) return;

  const activeGame = appState.games.find(g => g.gameId === appState.activeGameId);
  if (!activeGame || !activeGame.useTimer) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  // Game Selector Dropdown in Timer
  const gameSelect = document.getElementById('timer-game-select');
  if (gameSelect) {
    gameSelect.innerHTML = appState.games
      .filter(g => g.useTimer)
      .map(g => `<option value="${g.gameId}" ${g.gameId === appState.activeGameId ? 'selected' : ''}>${g.name}</option>`)
      .join('');
  }

  updateTimerDisplay();
}

function updateTimerDisplay() {
  const seconds = appState.timerState.remainingSeconds;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const minsStr = String(mins).padStart(2, '0');
  const secsStr = String(secs).padStart(2, '0');

  const minEl = document.getElementById('timer-minutes');
  const secEl = document.getElementById('timer-seconds');
  if (minEl) minEl.textContent = minsStr;
  if (secEl) secEl.textContent = secsStr;

  // Show mode timer display
  const smMin = document.getElementById('show-timer-minutes');
  const smSec = document.getElementById('show-timer-seconds');
  if (smMin) smMin.textContent = minsStr;
  if (smSec) smSec.textContent = secsStr;

  // Fullscreen timer display
  const fsMin = document.getElementById('fs-timer-min');
  const fsSec = document.getElementById('fs-timer-sec');
  if (fsMin) fsMin.textContent = minsStr;
  if (fsSec) fsSec.textContent = secsStr;

  // Visual warnings for standard panel
  const panel = document.getElementById('active-timer-panel');
  if (panel) {
    panel.classList.remove('warning-level-1', 'warning-level-2');
    if (appState.timerState.status === 'RUNNING') {
      if (seconds <= 30 && seconds > 0) {
        panel.classList.add('warning-level-2');
      } else if (seconds <= 60 && seconds > 0) {
        panel.classList.add('warning-level-1');
      }
    }
  }

  // Visual warnings for Fullscreen Dedicated Timer
  const fsStage = document.querySelector('.fs-timer-stage');
  const fsBanner = document.getElementById('fs-timer-warning-banner');
  const fsStatusTag = document.getElementById('fs-timer-status-tag');
  if (fsStage && fsBanner && fsStatusTag) {
    fsStage.classList.remove('warning-level-1', 'warning-level-2', 'countdown-10s');
    fsBanner.style.display = 'none';

    if (appState.timerState.status === 'RUNNING') {
      if (seconds <= 10 && seconds > 0) {
        fsStage.classList.add('warning-level-2', 'countdown-10s');
        fsBanner.textContent = `🚨 ${seconds} วินาทีสุดท้าย!`;
        fsBanner.style.display = 'block';
        fsStatusTag.textContent = 'วิกฤต (10 วิ)';
        fsStatusTag.style.background = 'rgba(239, 68, 68, 0.25)';
        fsStatusTag.style.color = '#ef4444';
      } else if (seconds <= 30 && seconds > 0) {
        fsStage.classList.add('warning-level-2');
        fsBanner.textContent = '⚠️ เหลือเวลา 30 วินาทีสุดท้าย!';
        fsBanner.style.display = 'block';
        fsStatusTag.textContent = 'ใกล้หมดเวลา (30 วิ)';
        fsStatusTag.style.background = 'rgba(239, 68, 68, 0.2)';
        fsStatusTag.style.color = '#ef4444';
      } else if (seconds <= 60 && seconds > 0) {
        fsStage.classList.add('warning-level-1');
        fsBanner.textContent = '⚠️ เหลือเวลา 1 นาทีสุดท้าย!';
        fsBanner.style.display = 'block';
        fsStatusTag.textContent = 'เตือนเวลา (1 นาที)';
        fsStatusTag.style.background = 'rgba(245, 158, 11, 0.2)';
        fsStatusTag.style.color = '#f59e0b';
      } else {
        fsStatusTag.textContent = 'กำลังแข่งขัน';
        fsStatusTag.style.background = 'rgba(56, 189, 248, 0.15)';
        fsStatusTag.style.color = '#38bdf8';
      }
    } else if (appState.timerState.status === 'PAUSED') {
      fsStatusTag.textContent = 'หยุดชั่วคราว';
      fsStatusTag.style.background = 'rgba(245, 158, 11, 0.15)';
      fsStatusTag.style.color = '#f59e0b';
    } else if (appState.timerState.status === 'TIME_UP') {
      fsStatusTag.textContent = 'หมดเวลา!';
      fsStatusTag.style.background = 'rgba(239, 68, 68, 0.3)';
      fsStatusTag.style.color = '#ef4444';
      fsBanner.textContent = "⏰ หมดเวลาการแข่งขัน! (TIME'S UP)";
      fsBanner.style.display = 'block';
    } else {
      fsStatusTag.textContent = 'พร้อมแข่งขัน';
      fsStatusTag.style.background = 'rgba(56, 189, 248, 0.15)';
      fsStatusTag.style.color = '#38bdf8';
    }
  }

  // Update button states on standard timer
  const startBtn = document.getElementById('btn-timer-start');
  const pauseBtn = document.getElementById('btn-timer-pause');
  if (startBtn && pauseBtn) {
    if (appState.timerState.status === 'RUNNING') {
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-flex';
    } else {
      startBtn.style.display = 'inline-flex';
      pauseBtn.style.display = 'none';
      startBtn.innerHTML = appState.timerState.status === 'PAUSED' ? '▶ RESUME' : '▶ START';
    }
  }

  // Update button states on fullscreen timer
  const fsStartBtn = document.getElementById('btn-fs-timer-start');
  const fsPauseBtn = document.getElementById('btn-fs-timer-pause');
  if (fsStartBtn && fsPauseBtn) {
    if (appState.timerState.status === 'RUNNING') {
      fsStartBtn.style.display = 'none';
      fsPauseBtn.style.display = 'inline-flex';
    } else {
      fsStartBtn.style.display = 'inline-flex';
      fsPauseBtn.style.display = 'none';
      fsStartBtn.innerHTML = appState.timerState.status === 'PAUSED' ? '▶ RESUME' : '▶ START';
    }
  }
}

// Timer Engine
let countdownTimerId = null;

export async function startTimerWithCountdown() {
  const activeGame = appState.games.find(g => g.gameId === appState.activeGameId);
  if (activeGame && activeGame.useTimer === false) {
    console.log('[Timer] Active game has useTimer set to false, skipping timer start.');
    return;
  }

  if (appState.timerState.status === 'PAUSED') {
    resumeTimer();
    return;
  }

  // Prevent multiple simultaneous countdown triggers
  if (appState.timerState.status === 'COUNTDOWN') {
    return;
  }

  unlockAudio();

  const overlay = document.getElementById('giant-countdown-overlay');
  const numEl = document.getElementById('giant-countdown-num');
  const subEl = document.getElementById('giant-countdown-sub');

  const countdownEnabled = appState.settings.countdownEnabled !== false;
  if (!countdownEnabled || !overlay || !numEl) {
    startTimerDirect();
    return;
  }

  appState.timerState.status = 'COUNTDOWN';
  overlay.classList.add('active');
  updateTimerDisplay();

  const duration = parseInt(appState.settings.countdownDuration, 10) || 5;
  let currentStep = duration;

  const soundEnabled = appState.settings.soundEnabled !== false && appState.settings.countdownSoundEnabled !== false;
  const volume = typeof appState.settings.countdownVolume === 'number' ? appState.settings.countdownVolume : 0.8;
  const activeCdAudioId = appState.settings.activeCountdownAudioId || 'default';

  const getSubtitle = (step) => {
    switch (step) {
      case 5: return 'GET READY!';
      case 4: return 'STAY SHARP!';
      case 3: return 'FOCUS!';
      case 2: return 'ALMOST THERE!';
      case 1: return 'STAND BY!';
      case 0:
      case 'GO':
      case 'GO!': return 'GAME START!';
      default: return 'GET READY!';
    }
  };

  const applyStepVisual = (step) => {
    numEl.classList.remove('is-go');
    // Trigger DOM reflow to restart CSS scale-pop animation smoothly
    void numEl.offsetWidth;

    if (step === 0 || step === 'GO' || step === 'GO!') {
      numEl.textContent = 'GO!';
      numEl.classList.add('is-go');
      if (subEl) subEl.textContent = 'GAME START!';
    } else {
      numEl.textContent = step;
      if (subEl) subEl.textContent = getSubtitle(step);
    }
  };

  // If custom audio was selected, play the custom blob; otherwise play default step tone
  if (soundEnabled && activeCdAudioId !== 'default') {
    getAudio(activeCdAudioId).then(audioRecord => {
      if (audioRecord && (audioRecord.audioBlob || audioRecord.blob)) {
        playAudioBlob(audioRecord.audioBlob || audioRecord.blob, volume).catch(err => {
          console.warn('[Audio] Custom countdown failed, using synthesizer:', err);
          playCountdownStep(currentStep, volume);
        });
      } else {
        playCountdownStep(currentStep, volume);
      }
    }).catch(() => {
      playCountdownStep(currentStep, volume);
    });
  } else if (soundEnabled) {
    playCountdownStep(currentStep, volume);
  }

  applyStepVisual(currentStep);

  countdownTimerId = setInterval(() => {
    currentStep--;
    if (currentStep > 0) {
      applyStepVisual(currentStep);
      if (soundEnabled && activeCdAudioId === 'default') {
        playCountdownStep(currentStep, volume);
      }
    } else if (currentStep === 0) {
      applyStepVisual(0);
      if (soundEnabled && activeCdAudioId === 'default') {
        playCountdownStep('GO', volume);
      }
    } else {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
      overlay.classList.remove('active');
      startTimerDirect();
    }
  }, 1000);
}

// Single Source of Truth for Timeout / Time's Up Sound Playback
export async function playTimeoutSound(volumeOverride = null) {
  const soundEnabled = appState.settings.soundEnabled !== false &&
    appState.settings.timeoutSoundEnabled !== false &&
    appState.settings.timeUpSoundEnabled !== false;

  const audioId = appState.settings.activeTimeoutAudioId || 'default';
  const volume = volumeOverride !== null ? volumeOverride : (
    typeof appState.settings.timeoutVolume === 'number'
      ? appState.settings.timeoutVolume
      : (typeof appState.settings.timeUpAudioVolume === 'number'
        ? (appState.settings.timeUpAudioVolume > 1 ? appState.settings.timeUpAudioVolume / 100 : appState.settings.timeUpAudioVolume)
        : 0.8)
  );

  let customBlob = null;
  if (audioId !== 'default') {
    try {
      const item = await getAudio(audioId);
      if (item && (item.audioBlob || item.blob)) {
        customBlob = item.audioBlob || item.blob;
      }
    } catch (err) {
      console.warn('[Audio] Failed to load custom timeout audio:', err);
    }
  }

  await playTimeUpSound({
    customBlob,
    volume,
    enabled: soundEnabled
  });
}

async function triggerTimeUpAlarm() {
  await playTimeoutSound();
}

function startTimerDirect() {
  if (appState.timerState.intervalId) {
    clearInterval(appState.timerState.intervalId);
  }

  appState.timerState.status = 'RUNNING';
  updateTimerDisplay();

  appState.timerState.intervalId = setInterval(async () => {
    if (appState.timerState.remainingSeconds > 0) {
      appState.timerState.remainingSeconds--;

      if (appState.timerState.remainingSeconds <= 10 && appState.timerState.remainingSeconds > 0) {
        playCountdownBeep(1000, 0.08);
      } else if (appState.timerState.remainingSeconds === 30 || appState.timerState.remainingSeconds === 60) {
        playWarningTick();
      }

      updateTimerDisplay();
    } else {
      clearInterval(appState.timerState.intervalId);
      appState.timerState.status = 'TIME_UP';
      updateTimerDisplay();
      await triggerTimeUpAlarm();
      const modal = document.getElementById('timeup-modal');
      if (modal) modal.classList.add('active');
    }
  }, 1000);
}

export function pauseTimer() {
  if (appState.timerState.status === 'COUNTDOWN') {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    const overlay = document.getElementById('giant-countdown-overlay');
    if (overlay) overlay.classList.remove('active');
    stopAllAudio();
    appState.timerState.status = 'STOPPED';
    updateTimerDisplay();
    return;
  }

  if (appState.timerState.status === 'RUNNING') {
    clearInterval(appState.timerState.intervalId);
    appState.timerState.status = 'PAUSED';
    updateTimerDisplay();
  }
}

export function resumeTimer() {
  startTimerDirect();
}

export function resetTimer() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  const overlay = document.getElementById('giant-countdown-overlay');
  if (overlay) overlay.classList.remove('active');
  stopAllAudio();

  clearInterval(appState.timerState.intervalId);
  appState.timerState.status = 'STOPPED';

  const activeGame = appState.games.find(g => g.gameId === appState.activeGameId);
  appState.timerState.remainingSeconds = activeGame ? (activeGame.durationSeconds || 600) : 600;
  updateTimerDisplay();
}

// 7-Step Leaderboard Animation Flow
export function run7StepLeaderboardAnimation(latestGameName) {
  const overlay = document.getElementById('step-animation-overlay');
  const content = document.getElementById('step-animation-content');
  if (!overlay || !content) return;

  overlay.classList.add('active');
  const standings = calculateStandings();
  const leader = standings[0];

  let currentStep = 1;

  function showStep() {
    if (currentStep === 1) {
      playCountdownBeep(600);
      content.innerHTML = `
        <div class="step-card-reveal">
          <div style="font-size:3.5rem; margin-bottom:16px;">⚙️</div>
          <h2 style="font-size:2.2rem; font-weight:900; color:#38bdf8; margin-bottom:12px;">กำลังคำนวณคะแนน...</h2>
          <p style="font-size:1.3rem; color:#cbd5e1;">การแข่งขัน: ${latestGameName || 'เกมล่าสุด'}</p>
        </div>
      `;
    } else if (currentStep === 2) {
      playCountdownBeep(700);
      content.innerHTML = `
        <div class="step-card-reveal">
          <h2 style="font-size:2.2rem; font-weight:900; color:#38bdf8; margin-bottom:20px;">คะแนนจากเกม: ${latestGameName || ''}</h2>
          <div style="display:flex; justify-content:center; gap:20px; flex-wrap:wrap;">
            ${appState.teams.map(t => {
              const res = (appState.results[appState.activeGameId] || []).find(r => r.teamId === t.teamId);
              return `
                <div style="background:#09121d; padding:18px 24px; border-radius:12px; border-top:5px solid ${t.teamColor}; min-width:140px;">
                  <div style="font-weight:800; font-size:1.1rem;">${t.teamName}</div>
                  <div style="font-size:2.6rem; font-weight:900; color:${t.teamColor};">+${res ? res.points : 0}</div>
                  <div style="font-size:0.95rem; color:#94a3b8;">อันดับ ${res ? res.rank : '-'}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (currentStep === 3) {
      playCountdownBeep(800);
      content.innerHTML = `
        <div class="step-card-reveal">
          <h2 style="font-size:2.2rem; font-weight:900; color:#38bdf8; margin-bottom:20px;">รวมคะแนนสะสมล่าสุด</h2>
          <div style="display:flex; justify-content:center; gap:20px; flex-wrap:wrap;">
            ${standings.map(t => `
              <div style="background:#09121d; padding:20px 24px; border-radius:12px; border:2px solid ${t.teamColor}; min-width:150px;">
                <div style="font-weight:800; font-size:1.15rem;">${t.teamName}</div>
                <div style="font-size:3rem; font-weight:900; color:${t.teamColor};">${t.totalScore}</div>
                <div style="font-size:0.9rem; color:#94a3b8;">คะแนนรวม</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (currentStep === 4) {
      playRankStinger(3);
      const team3 = standings.find(t => t.rank === 3) || standings[2];
      content.innerHTML = `
        <div class="step-card-reveal">
          <div style="font-size:4rem; margin-bottom:10px;">🥉</div>
          <h2 style="font-size:2.4rem; font-weight:900; color:#fdba74;">อันดับที่ 3</h2>
          <div style="font-size:2.5rem; font-weight:900; color:${team3.teamColor}; margin:10px 0;">${team3.teamName}</div>
          <div style="font-size:1.5rem;">คะแนนรวม: <strong>${team3.totalScore} คะแนน</strong></div>
        </div>
      `;
    } else if (currentStep === 5) {
      playRankStinger(2);
      const team2 = standings.find(t => t.rank === 2) || standings[1];
      content.innerHTML = `
        <div class="step-card-reveal">
          <div style="font-size:4rem; margin-bottom:10px;">🥈</div>
          <h2 style="font-size:2.4rem; font-weight:900; color:#cbd5e1;">อันดับที่ 2</h2>
          <div style="font-size:2.5rem; font-weight:900; color:${team2.teamColor}; margin:10px 0;">${team2.teamName}</div>
          <div style="font-size:1.5rem;">คะแนนรวม: <strong>${team2.totalScore} คะแนน</strong></div>
        </div>
      `;
    } else if (currentStep === 6) {
      playRankStinger(1);
      const team1 = leader;
      content.innerHTML = `
        <div class="step-card-reveal">
          <div style="font-size:4rem; margin-bottom:10px;">🥇</div>
          <h2 style="font-size:2.4rem; font-weight:900; color:#facc15;">อันดับที่ 1</h2>
          <div style="font-size:2.8rem; font-weight:900; color:${team1.teamColor}; margin:10px 0;">${team1.teamName}</div>
          <div style="font-size:1.6rem;">คะแนนรวม: <strong>${team1.totalScore} คะแนน</strong></div>
        </div>
      `;
    } else if (currentStep === 7) {
      playCelebrationFanfare();
      const portraitSrc = getLeaderPortraitSrc(leader);
      content.innerHTML = `
        <div class="step-card-reveal" style="border-color:#facc15; box-shadow:0 0 60px rgba(250,204,21,0.6);">
          <div style="font-size:3.5rem; margin-bottom:8px;">👑 🏆 🥇</div>
          <h2 style="color:#facc15; font-size:2.8rem; font-weight:900; margin-bottom:16px;">ผู้นำอันดับ 1 ของการแข่งขัน!</h2>
          <div style="display:flex; align-items:center; justify-content:center; gap:24px; margin:20px 0;">
            <div style="width:130px; height:130px; border-radius:50%; border:5px solid #facc15; overflow:hidden; box-shadow:0 0 30px rgba(250,204,21,0.5);">
              <img src="${portraitSrc}" style="width:100%; height:100%; object-fit:cover; object-position:top center;" />
            </div>
            <div style="text-align:left;">
              <div style="font-size:2.8rem; font-weight:900; color:${leader.teamColor}; line-height:1.1;">${leader.teamName}</div>
              <div style="font-size:1.4rem; color:#93c5fd; font-weight:700;">หัวหน้าทีม: ${leader.leaderName}</div>
              <div style="font-size:2rem; font-weight:900; color:#ffffff; margin-top:6px;">คะแนนสะสม: ${leader.totalScore} แต้ม</div>
            </div>
          </div>
          <button class="btn btn-show-mode" style="margin-top:20px; padding:14px 36px; font-size:1.2rem;" onclick="document.getElementById('step-animation-overlay').classList.remove('active');">
            ดูตารางคะแนนรวม ➔
          </button>
        </div>
      `;

      // Step 8: Auto-transition to animated horizontal leaderboard
      setTimeout(() => {
        if (overlay && overlay.classList.contains('active')) {
          overlay.classList.remove('active');
          renderScoreProgressionBars();
          updateShowModeView();
        }
      }, 3500);
      return;
    }

    currentStep++;
    setTimeout(showStep, 2200);
  }

  showStep();
}

// Update Show Mode 16:9 View (ZERO VERTICAL SCROLL, BALANCED CARDS)
export function updateShowModeView() {
  const standings = calculateStandings();
  const showCardsRow = document.getElementById('show-mode-cards-row');
  const showBarsBox = document.getElementById('show-mode-bars-container');

  // Keep all logos in sync
  updateAllLogos(appState.customLogoUrl);

  const eventTitleEl = document.getElementById('show-mode-event-title');
  if (eventTitleEl && appState.settings.eventName) {
    eventTitleEl.textContent = `🏆 LIVE RANKING • ${appState.settings.eventName}`;
  }

  // Active game and timer pill visibility in Show Mode
  const activeGame = appState.games.find(g => g.gameId === appState.activeGameId) || appState.games[0];
  const showTimerPill = document.getElementById('show-mode-timer-pill');
  if (showTimerPill) {
    if (activeGame && activeGame.useTimer) {
      showTimerPill.style.display = 'flex';
      const mins = Math.floor(appState.timerState.remainingSeconds / 60);
      const secs = appState.timerState.remainingSeconds % 60;
      const smMin = document.getElementById('show-timer-minutes');
      const smSec = document.getElementById('show-timer-seconds');
      if (smMin) smMin.textContent = String(mins).padStart(2, '0');
      if (smSec) smSec.textContent = String(secs).padStart(2, '0');
    } else {
      showTimerPill.style.display = 'none';
    }
  }

  if (showCardsRow) {
    showCardsRow.innerHTML = standings.map((team, index) => {
      // PART 27: CURRENT LEADER only for rank 1 (top of standings) when competition has scores
      const isCurrentLeader = team.rank === 1 && index === 0 && team.totalScore > 0;
      const portraitSrc = getLeaderPortraitSrc(team);

      // PART 26: RANK MEDALS
      let rankBadge = `#${team.rank}`;
      let rankColor = '#ffffff';
      if (team.rank === 1) {
        rankBadge = '🥇 #1';
        rankColor = '#facc15';
      } else if (team.rank === 2) {
        rankBadge = '🥈 #2';
        rankColor = '#e2e8f0';
      } else if (team.rank === 3) {
        rankBadge = '🥉 #3';
        rankColor = '#f97316';
      } else {
        rankBadge = '⭐ #4';
        rankColor = '#38bdf8';
      }

      return `
        <div class="show-mode-card ${isCurrentLeader ? 'is-champion' : ''}" 
             style="--card-team-color: ${team.teamColor};">
          
          ${isCurrentLeader ? `<div class="current-leader-badge-pill">👑 CURRENT LEADER</div>` : ''}

          <!-- 1. RANK + GAMES PLAYED (Priority 2) -->
          <div class="show-card-header">
            <div class="show-card-rank" style="color: ${rankColor};">
              ${rankBadge}
            </div>
            <div class="show-card-played">
              แข่ง ${team.gamesPlayed}/${appState.games.length} เกม
            </div>
          </div>

          <!-- 2. LEADER IMAGE (Priority 1: Uniform 4/3 Aspect Ratio, object-fit: contain) -->
          <div class="show-leader-frame" style="border-color: ${team.teamColor};">
            <img src="${portraitSrc}" alt="${team.leaderName}" class="show-leader-img" />
          </div>

          <!-- 3. TEAM NAME & LEADER NAME (Priority 4 & 5 - NO SLOGAN, NO TEAMID) -->
          <div class="show-card-names">
            <div class="show-team-name" style="color: ${team.teamColor};" title="${team.teamName}">
              ${team.teamName}
            </div>
            <div class="show-leader-name" title="${team.leaderName}">
              ผู้นำ: ${team.leaderName}
            </div>
          </div>

          <!-- 4. TOTAL SCORE (Priority 3) -->
          <div class="show-card-score-box" style="border-top-color: ${team.teamColor};">
            <div class="show-score-val" style="color: ${team.teamColor};">
              ${team.totalScore}
            </div>
            <div class="show-score-unit">
              POINTS
            </div>
          </div>

        </div>
      `;
    }).join('');
  }

  // Show Mode Bars - includes leader avatar in each bar
  if (showBarsBox) {
    const maxScore = Math.max(...standings.map(s => s.totalScore), 12);
    showBarsBox.innerHTML = standings.map(team => {
      const widthPercent = Math.max((team.totalScore / maxScore) * 100, 6);
      const portraitSrc = getLeaderPortraitSrc(team);

      let rankIcon = `#${team.rank}`;
      if (team.rank === 1) rankIcon = '🥇';
      else if (team.rank === 2) rankIcon = '🥈';
      else if (team.rank === 3) rankIcon = '🥉';
      else rankIcon = '⭐';

      return `
        <div style="display:flex; align-items:center; gap:clamp(8px, 1vw, 14px); padding:2px 0;">
          <div style="width:clamp(180px, 17vw, 260px); display:flex; align-items:center; gap:clamp(8px, 0.8vw, 12px); flex-shrink:0;">
            <span style="font-size:clamp(16px, 1.4vw, 24px); min-width:28px; text-align:center;">${rankIcon}</span>
            <div style="width:clamp(36px, 3vw, 48px); height:clamp(36px, 3vw, 48px); border-radius:8px; border:2px solid ${team.teamColor}; overflow:hidden; flex-shrink:0; background:#060d17; display:flex; align-items:center; justify-content:center;">
              <img src="${portraitSrc}" alt="${team.leaderName}" style="width:100%; height:100%; object-fit:contain; object-position:center bottom;" />
            </div>
            <div style="overflow:hidden; min-width:0;">
              <div style="font-size:clamp(13px, 1.05vw, 18px); font-weight:800; color:${team.teamColor}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${team.teamName}</div>
              <div style="font-size:clamp(11px, 0.78vw, 14px); color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">ผู้นำ: ${team.leaderName}</div>
            </div>
          </div>
          <div style="flex:1; height:clamp(18px, 1.8vh, 26px); background:rgba(0,0,0,0.6); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.12);">
            <div style="width:${widthPercent}%; height:100%; background:linear-gradient(90deg, ${team.teamColor}aa 0%, ${team.teamColor} 100%); border-radius:6px; transition:width 0.8s ease;">
            </div>
          </div>
          <div style="font-size:clamp(18px, 1.6vw, 28px); font-weight:900; color:${team.teamColor}; min-width:clamp(60px, 6vw, 85px); text-align:right; font-family:'Kanit', sans-serif;">
            ${team.totalScore} <span style="font-size:0.5em; color:#94a3b8;">PTS</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Score Entry Modal Handling
window.openScoreModal = function(gameId) {
  const game = appState.games.find(g => g.gameId === gameId) || appState.games[0];
  appState.activeGameId = game.gameId;

  const modal = document.getElementById('score-entry-modal');
  if (!modal) return;

  const gameSelect = document.getElementById('score-game-select');
  if (gameSelect) {
    gameSelect.innerHTML = appState.games.map(g => {
      const isDone = !!appState.results[g.gameId];
      return `<option value="${g.gameId}" ${g.gameId === game.gameId ? 'selected' : ''}>${g.name} ${isDone ? '(บันทึกแล้ว)' : ''}</option>`;
    }).join('');
  }

  updateScoreModalForm();
  modal.classList.add('active');
};

function updateScoreModalForm() {
  const selectedGameId = document.getElementById('score-game-select').value;
  const existingResults = appState.results[selectedGameId];
  const warningBanner = document.getElementById('score-existing-warning');
  const deleteBtn = document.getElementById('btn-delete-game-score');

  if (existingResults && existingResults.length > 0) {
    if (warningBanner) warningBanner.style.display = 'block';
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
  } else {
    if (warningBanner) warningBanner.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  const listEl = document.getElementById('team-score-assign-list');
  if (!listEl) return;

  listEl.innerHTML = appState.teams.map((team, idx) => {
    let assignedRank = idx + 1;
    if (existingResults) {
      const saved = existingResults.find(r => r.teamId === team.teamId);
      if (saved) assignedRank = saved.rank;
    }

    const portraitSrc = getLeaderPortraitSrc(team);

    return `
      <div class="team-assign-item" style="--item-team-color: ${team.teamColor}">
        <div class="team-assign-left">
          <div style="width:48px; height:48px; border-radius:50%; overflow:hidden; border:2px solid ${team.teamColor}; flex-shrink:0;">
            <img src="${portraitSrc}" alt="${team.leaderName}" style="width:100%; height:100%; object-fit:cover;" />
          </div>
          <div>
            <div style="font-weight:800; font-size:1.1rem; color:${team.teamColor};">${team.teamName}</div>
            <div style="font-size:0.85rem; color:#cbd5e1;">หัวหน้า: ${team.leaderName}</div>
          </div>
        </div>
        <div class="rank-selector-group">
          <label style="font-size:0.9rem; font-weight:700; color:#ffffff;">อันดับ:</label>
          <select class="form-select team-rank-select" data-team-id="${team.teamId}" style="width:150px; font-weight:800;" onchange="window.validateRanksPreview()">
            <option value="1" ${assignedRank === 1 ? 'selected' : ''}>🥇 อันดับ 1</option>
            <option value="2" ${assignedRank === 2 ? 'selected' : ''}>🥈 อันดับ 2</option>
            <option value="3" ${assignedRank === 3 ? 'selected' : ''}>🥉 อันดับ 3</option>
            <option value="4" ${assignedRank === 4 ? 'selected' : ''}>4 อันดับ 4</option>
          </select>
          <span class="preview-points-badge" id="pts-preview-${team.teamId}" style="font-weight:900; min-width:70px; font-size:1.1rem; color:${team.teamColor};"></span>
        </div>
      </div>
    `;
  }).join('');

  validateRanksPreview();
}

window.validateRanksPreview = function() {
  const selects = document.querySelectorAll('.team-rank-select');
  const ranksChosen = [];
  let hasDuplicate = false;

  selects.forEach(sel => {
    const r = parseInt(sel.value, 10);
    if (ranksChosen.includes(r)) {
      hasDuplicate = true;
    }
    ranksChosen.push(r);

    const teamId = sel.getAttribute('data-team-id');
    const pts = appState.scoring[`rank${r}`] || 1;
    const badge = document.getElementById(`pts-preview-${teamId}`);
    if (badge) {
      badge.textContent = `+${pts} แต้ม`;
    }
  });

  const errorEl = document.getElementById('score-validation-error');
  const submitBtn = document.getElementById('btn-save-score-submit');

  if (hasDuplicate || ranksChosen.length !== 4) {
    if (errorEl) {
      errorEl.textContent = '⚠️ อันดับต้องไม่ซ้ำกัน! กำหนดอันดับ 1 ถึง 4 ให้ครบทั้ง 4 ทีม';
      errorEl.style.display = 'block';
    }
    if (submitBtn) submitBtn.disabled = true;
    return false;
  } else {
    if (errorEl) errorEl.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
    return true;
  }
};

// Save Score Entry & trigger animations
export function saveScoreEntry() {
  if (!window.validateRanksPreview()) return;

  const gameId = document.getElementById('score-game-select').value;
  const game = appState.games.find(g => g.gameId === gameId);
  const gameName = game ? game.name : gameId;

  const selects = document.querySelectorAll('.team-rank-select');
  const newGameScores = [];

  // Snapshot previous scores
  const preStandings = calculateStandings();
  const oldScores = {};
  preStandings.forEach(t => { oldScores[t.teamId] = t.totalScore; });

  selects.forEach(sel => {
    const teamId = sel.getAttribute('data-team-id');
    const rank = parseInt(sel.value, 10);
    const points = appState.scoring[`rank${rank}`] || 1;
    const team = appState.teams.find(t => t.teamId === teamId);

    newGameScores.push({
      resultId: `res_${Date.now()}_${teamId}`,
      gameId,
      teamId,
      teamName: team ? team.teamName : teamId,
      rank,
      points,
      recordedAt: new Date().toISOString()
    });
  });

  // Save into state
  appState.results[gameId] = newGameScores;
  saveToStorage('odpc1_results', appState.results);

  // Add into history
  appState.history.unshift({
    resultId: `hist_${Date.now()}`,
    gameId,
    gameName,
    recordedAt: new Date().toISOString(),
    recordedBy: appState.settings.recorderName || 'คณะกรรมการ',
    scores: newGameScores
  });
  saveToStorage('odpc1_history', appState.history);

  // Close modal
  document.getElementById('score-entry-modal').classList.remove('active');

  // Trigger floating scores animation
  newGameScores.forEach(s => {
    const floatEl = document.getElementById(`float-score-${s.teamId}`);
    if (floatEl) {
      floatEl.textContent = `+${s.points} แต้ม!`;
      floatEl.classList.remove('active');
      void floatEl.offsetWidth; // trigger reflow
      floatEl.classList.add('active');
    }
  });

  // Recalculate standings and check leader change
  const { hasLeaderChanged } = updateLeaderboardData();

  renderHeroArea();
  renderTeamRankingCards();
  renderScoreProgressionBars();
  renderMatrixTable();
  updateShowModeView();

  // If leader didn't change, trigger full 7-step game show animation
  if (!hasLeaderChanged) {
    run7StepLeaderboardAnimation(gameName);
  }
}

// Delete score of selected game
export function deleteCurrentGameScore() {
  const selectedGameId = document.getElementById('score-game-select').value;
  const game = appState.games.find(g => g.gameId === selectedGameId);
  const gameName = game ? game.name : selectedGameId;

  if (confirm(`คุณต้องการลบผลคะแนนของ "${gameName}" ใช่หรือไม่?`)) {
    delete appState.results[selectedGameId];
    saveToStorage('odpc1_results', appState.results);

    // Remove from history
    appState.history = appState.history.filter(h => h.gameId !== selectedGameId);
    saveToStorage('odpc1_history', appState.history);

    const modal = document.getElementById('score-entry-modal');
    if (modal) modal.classList.remove('active');

    updateLeaderboardData();
    renderHeroArea();
    renderTeamRankingCards();
    renderScoreProgressionBars();
    renderMatrixTable();
    updateShowModeView();
    showToast(`🗑️ ลบผลคะแนนของ "${gameName}" เรียบร้อยแล้ว`, 'info');
  }
}

// Smooth Number Counter Stepper
export function animateScoreCounter(elementId, startVal, endVal, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startTime = performance.now();
  function updateNumber(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const currentVal = Math.round(startVal + (endVal - startVal) * progress);
    el.textContent = currentVal;
    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    }
  }
  requestAnimationFrame(updateNumber);
}

// Setup Event Listeners
function setupEventListeners() {
  // Sound toggle button
  const soundBtn = document.getElementById('btn-toggle-sound');
  if (soundBtn) {
    soundBtn.onclick = () => {
      appState.settings.soundEnabled = !appState.settings.soundEnabled;
      setAudioEnabled(appState.settings.soundEnabled);
      saveToStorage('odpc1_settings', appState.settings);
      renderHeader();
    };
  }

  // Test Sound button
  const testSoundBtn = document.getElementById('btn-test-sound');
  if (testSoundBtn) {
    testSoundBtn.onclick = () => {
      setAudioEnabled(true);
      playCelebrationFanfare();
    };
  }

  // Show Mode button
  const showModeBtn = document.getElementById('btn-open-show-mode');
  if (showModeBtn) {
    showModeBtn.onclick = () => {
      updateShowModeView();
      document.getElementById('show-mode-overlay').classList.add('active');
    };
  }

  const closeShowModeBtn = document.getElementById('btn-close-show-mode');
  if (closeShowModeBtn) {
    closeShowModeBtn.onclick = () => {
      document.getElementById('show-mode-overlay').classList.remove('active');
    };
  }

  // Full Screen Button
  const fullScreenBtn = document.getElementById('btn-fullscreen');
  if (fullScreenBtn) {
    fullScreenBtn.onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen error:', err);
        });
      } else {
        document.exitFullscreen();
      }
    };
  }

  // Timer Controls
  const startBtn = document.getElementById('btn-timer-start');
  if (startBtn) startBtn.onclick = startTimerWithCountdown;

  const pauseBtn = document.getElementById('btn-timer-pause');
  if (pauseBtn) pauseBtn.onclick = pauseTimer;

  const resetBtn = document.getElementById('btn-timer-reset');
  if (resetBtn) resetBtn.onclick = resetTimer;

  const timerGameSelect = document.getElementById('timer-game-select');
  if (timerGameSelect) {
    timerGameSelect.onchange = (e) => {
      appState.activeGameId = e.target.value;
      resetTimer();
      renderTimerWidget();
    };
  }

  // Modal open buttons
  const openRecordBtn = document.getElementById('btn-open-record-modal');
  if (openRecordBtn) {
    openRecordBtn.onclick = () => {
      const unplayed = appState.games.find(g => !appState.results[g.gameId]);
      window.openScoreModal(unplayed ? unplayed.gameId : appState.games[0].gameId);
    };
  }

  const scoreGameSelect = document.getElementById('score-game-select');
  if (scoreGameSelect) {
    scoreGameSelect.onchange = updateScoreModalForm;
  }

  const saveScoreBtn = document.getElementById('btn-save-score-submit');
  if (saveScoreBtn) {
    saveScoreBtn.onclick = saveScoreEntry;
  }

  const deleteScoreBtn = document.getElementById('btn-delete-game-score');
  if (deleteScoreBtn) {
    deleteScoreBtn.onclick = deleteCurrentGameScore;
  }

  // Animation Play button on dashboard
  const playAnimBtn = document.getElementById('btn-play-animation');
  if (playAnimBtn) {
    playAnimBtn.onclick = () => {
      run7StepLeaderboardAnimation('ทบทวนคะแนนสะสม');
    };
  }

  // History Modal
  const openHistoryBtn = document.getElementById('btn-open-history');
  if (openHistoryBtn) {
    openHistoryBtn.onclick = openHistoryModal;
  }

  // Settings Modal
  const openSettingsBtn = document.getElementById('btn-open-settings');
  if (openSettingsBtn) {
    openSettingsBtn.onclick = openSettingsModal;
  }

  // Team Management Modal
  const openTeamsBtn = document.getElementById('btn-open-teams');
  if (openTeamsBtn) {
    openTeamsBtn.onclick = openTeamsModal;
  }

  // Fullscreen Dedicated Timer
  const openFsTimerBtn = document.getElementById('btn-open-fullscreen-timer');
  const expandFsTimerBtn = document.getElementById('btn-timer-expand-fullscreen');
  if (openFsTimerBtn) openFsTimerBtn.onclick = openFullscreenTimerOverlay;
  if (expandFsTimerBtn) expandFsTimerBtn.onclick = openFullscreenTimerOverlay;

  const closeFsTimerBtn = document.getElementById('btn-close-fs-timer');
  if (closeFsTimerBtn) closeFsTimerBtn.onclick = closeFullscreenTimerOverlay;

  const fsStartBtn = document.getElementById('btn-fs-timer-start');
  if (fsStartBtn) fsStartBtn.onclick = startTimerWithCountdown;

  const fsPauseBtn = document.getElementById('btn-fs-timer-pause');
  if (fsPauseBtn) fsPauseBtn.onclick = pauseTimer;

  const fsResetBtn = document.getElementById('btn-fs-timer-reset');
  if (fsResetBtn) fsResetBtn.onclick = resetTimer;

  // Audio Settings Modal
  const openAudioBtn = document.getElementById('btn-open-audio-settings');
  if (openAudioBtn) openAudioBtn.onclick = openAudioSettingsModal;

  const saveModalAudioBtn = document.getElementById('btn-modal-audio-save');
  if (saveModalAudioBtn) saveModalAudioBtn.onclick = saveAudioModalSettings;

  // Time's Up Close Button
  const closeTimeUpBtn = document.getElementById('btn-close-timeup');
  if (closeTimeUpBtn) {
    closeTimeUpBtn.onclick = () => {
      document.getElementById('timeup-modal').classList.remove('active');
    };
  }

  // Generic modal close buttons
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.onclick = () => {
      stopCurrentPreview();
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    };
  });
}

// Fullscreen Dedicated Timer Handlers
export function openFullscreenTimerOverlay() {
  updateAllLogos(appState.customLogoUrl);
  const activeGame = appState.games.find(g => g.gameId === appState.activeGameId);
  const titleEl = document.getElementById('fs-timer-game-name');
  if (titleEl) {
    titleEl.textContent = activeGame ? `${activeGame.order}. ${activeGame.name}` : 'การแข่งขัน';
  }
  const eventTitleEl = document.getElementById('fs-timer-event-title');
  if (eventTitleEl && appState.settings.eventName) {
    eventTitleEl.textContent = appState.settings.eventName;
  }
  updateTimerDisplay();
  const overlay = document.getElementById('fullscreen-timer-overlay');
  if (overlay) overlay.classList.add('active');
}

export function closeFullscreenTimerOverlay() {
  const overlay = document.getElementById('fullscreen-timer-overlay');
  if (overlay) overlay.classList.remove('active');
}

// Audio & Countdown Settings & Library Engine
async function refreshAudioSelectOptions() {
  const timeoutSelects = [
    document.getElementById('modal-timeout-select'),
    document.getElementById('setting-timeup-sound-select')
  ].filter(Boolean);

  const countdownSelect = document.getElementById('modal-countdown-select');

  // Load from IndexedDB
  const timeoutAudios = await getAllAudio('TIME_UP');
  const countdownAudios = await getAllAudio('COUNTDOWN');

  // Populate Timeout Dropdowns
  timeoutSelects.forEach(select => {
    let html = `<option value="default">🔔 เสียงค่าเริ่มต้น (Default Game Show Buzzer)</option>`;
    timeoutAudios.forEach(item => {
      html += `<option value="${item.audioId}">🎵 ${item.audioName}</option>`;
    });
    const currentVal = appState.settings.activeTimeoutAudioId || 'default';
    select.innerHTML = html;
    select.value = currentVal;
    if (select.selectedIndex === -1) {
      select.value = 'default';
      appState.settings.activeTimeoutAudioId = 'default';
    }
  });

  // Populate Countdown Dropdown
  if (countdownSelect) {
    let html = `<option value="default">🔔 เสียงค่าเริ่มต้น (Game Show Sports Chime)</option>`;
    countdownAudios.forEach(item => {
      html += `<option value="${item.audioId}">🎵 ${item.audioName}</option>`;
    });
    const currentVal = appState.settings.activeCountdownAudioId || 'default';
    countdownSelect.innerHTML = html;
    countdownSelect.value = currentVal;
    if (countdownSelect.selectedIndex === -1) {
      countdownSelect.value = 'default';
      appState.settings.activeCountdownAudioId = 'default';
    }
  }
}

async function renderAudioLibrary() {
  const timeoutContainer = document.getElementById('library-list-timeout');
  const countdownContainer = document.getElementById('library-list-countdown');
  if (!timeoutContainer || !countdownContainer) return;

  const timeoutAudios = await getAllAudio('TIME_UP');
  const countdownAudios = await getAllAudio('COUNTDOWN');

  const formatBytes = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderSection = (items, activeId, category) => {
    const isDefaultActive = activeId === 'default' || !activeId;
    const defaultItemHTML = `
      <div class="audio-lib-item ${isDefaultActive ? 'is-active' : ''}" style="margin-bottom:8px; border-left:4px solid #38bdf8;">
        <div class="audio-lib-info">
          <div class="audio-lib-title">
            <span>⚙️</span>
            <span style="font-weight:700;">เสียงค่าเริ่มต้นระบบ (Default System ${category === 'TIME_UP' ? 'Buzzer' : 'Countdown'})</span>
            ${isDefaultActive ? '<span class="audio-lib-badge active">✓ ใช้งานอยู่</span>' : ''}
          </div>
          <div class="audio-lib-meta">
            <span>Web Audio API Synthesizer</span>
            <span>•</span>
            <span>เสียงมาตรฐาน</span>
          </div>
        </div>
        <div class="audio-lib-actions">
          <button type="button" class="btn btn-outline btn-sm btn-lib-preview-default" data-category="${category}" style="padding:4px 10px; font-size:0.82rem;">
            ▶ ฟัง
          </button>
          ${!isDefaultActive ? `
            <button type="button" class="btn btn-secondary btn-sm btn-lib-select-default" data-category="${category}" style="padding:4px 10px; font-size:0.82rem; color:#38bdf8; font-weight:700;">
              ↩ ใช้เสียงระบบ
            </button>
          ` : ''}
        </div>
      </div>
    `;

    if (!items || items.length === 0) {
      return defaultItemHTML + `
        <div style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.85rem; background:rgba(255,255,255,0.02); border-radius:8px; border:1px dashed var(--border-subtle); margin-top:6px;">
          ยังไม่มีไฟล์เสียงที่อัปโหลดเพิ่ม (กำลังใช้เสียงสังเคราะห์ค่าเริ่มต้น)
        </div>
      `;
    }

    const uploadedItemsHTML = items.map(item => {
      const isActive = item.audioId === activeId;
      const cleanType = (item.audioType || 'audio/mpeg').replace('audio/', '').toUpperCase();

      return `
        <div class="audio-lib-item ${isActive ? 'is-active' : ''}" style="margin-bottom:8px;">
          <div class="audio-lib-info">
            <div class="audio-lib-title">
              <span>🎵</span>
              <span title="${item.audioName}">${item.audioName}</span>
              ${isActive ? '<span class="audio-lib-badge active">✓ ใช้งานอยู่</span>' : ''}
            </div>
            <div class="audio-lib-meta">
              <span>${cleanType}</span>
              <span>•</span>
              <span>${formatBytes(item.audioSize)}</span>
              <span>•</span>
              <span>${formatDate(item.uploadedAt)}</span>
            </div>
          </div>
          <div class="audio-lib-actions">
            <button type="button" class="btn btn-outline btn-sm btn-lib-preview" data-id="${item.audioId}" data-category="${category}" style="padding:4px 10px; font-size:0.82rem;">
              ▶ ฟัง
            </button>
            ${!isActive ? `
              <button type="button" class="btn btn-secondary btn-sm btn-lib-select" data-id="${item.audioId}" data-category="${category}" style="padding:4px 10px; font-size:0.82rem;">
                ○ เลือกใช้
              </button>
            ` : ''}
            <button type="button" class="btn btn-danger btn-sm btn-lib-delete" data-id="${item.audioId}" data-name="${item.audioName}" data-category="${category}" style="padding:4px 8px; font-size:0.82rem;" title="ลบไฟล์เสียง">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    return defaultItemHTML + uploadedItemsHTML;
  };

  timeoutContainer.innerHTML = renderSection(timeoutAudios, appState.settings.activeTimeoutAudioId, 'TIME_UP');
  countdownContainer.innerHTML = renderSection(countdownAudios, appState.settings.activeCountdownAudioId, 'COUNTDOWN');

  // Attach Event Handlers to Library Items
  document.querySelectorAll('.btn-lib-preview-default').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.getAttribute('data-category');
      if (cat === 'TIME_UP') {
        previewAudio(null, 0.8, 'TIME_UP');
      } else {
        previewAudio(null, 0.8, 'COUNTDOWN');
      }
    };
  });

  document.querySelectorAll('.btn-lib-select-default').forEach(btn => {
    btn.onclick = async () => {
      const cat = btn.getAttribute('data-category');
      if (cat === 'TIME_UP') {
        appState.settings.activeTimeoutAudioId = 'default';
      } else {
        appState.settings.activeCountdownAudioId = 'default';
      }
      saveToStorage('odpc1_settings', appState.settings);
      await refreshAudioSelectOptions();
      await renderAudioLibrary();
    };
  });

  document.querySelectorAll('.btn-lib-preview').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const item = await getAudio(id);
      if (item && (item.audioBlob || item.blob)) {
        previewAudio(item.audioBlob || item.blob, 0.85);
      }
    };
  });

  document.querySelectorAll('.btn-lib-select').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const cat = btn.getAttribute('data-category');
      if (cat === 'TIME_UP') {
        appState.settings.activeTimeoutAudioId = id;
      } else {
        appState.settings.activeCountdownAudioId = id;
      }
      saveToStorage('odpc1_settings', appState.settings);
      await refreshAudioSelectOptions();
      await renderAudioLibrary();
    };
  });

  document.querySelectorAll('.btn-lib-delete').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      const cat = btn.getAttribute('data-category');
      if (confirm(`คุณต้องการลบไฟล์เสียง "${name}" ออกจากระบบใช่หรือไม่?`)) {
        stopCurrentPreview();
        await deleteAudio(id);
        if (cat === 'TIME_UP' && appState.settings.activeTimeoutAudioId === id) {
          appState.settings.activeTimeoutAudioId = 'default';
        } else if (cat === 'COUNTDOWN' && appState.settings.activeCountdownAudioId === id) {
          appState.settings.activeCountdownAudioId = 'default';
        }
        saveToStorage('odpc1_settings', appState.settings);
        await refreshAudioSelectOptions();
        await renderAudioLibrary();
      }
    };
  });
}

// Unified Audio Controls Initializer
async function setupAudioControls(context = 'modal') {
  // 1. Time Up Sound Controls in Audio Modal
  const timeoutEnabledChk = document.getElementById('modal-timeout-enabled');
  const timeoutSelect = document.getElementById('modal-timeout-select');
  const timeoutFileInput = document.getElementById('modal-timeout-file');
  const timeoutUploadStatus = document.getElementById('modal-timeout-upload-status');
  const timeoutVolSlider = document.getElementById('modal-timeout-volume');
  const timeoutVolVal = document.getElementById('modal-timeout-volume-val');
  const timeoutPreviewBtn = document.getElementById('btn-modal-timeout-preview');
  const timeoutStopBtn = document.getElementById('btn-modal-timeout-stop');
  const timeoutTestBtn = document.getElementById('btn-modal-timeout-test');

  // 2. Countdown Sound Controls in Audio Modal
  const cdEnabledChk = document.getElementById('modal-countdown-enabled');
  const cdSoundEnabledChk = document.getElementById('modal-countdown-sound-enabled');
  const cdDurationSelect = document.getElementById('modal-countdown-duration');
  const cdSelect = document.getElementById('modal-countdown-select');
  const cdFileInput = document.getElementById('modal-countdown-file');
  const cdUploadStatus = document.getElementById('modal-countdown-upload-status');
  const cdVolSlider = document.getElementById('modal-countdown-volume');
  const cdVolVal = document.getElementById('modal-countdown-volume-val');
  const cdPreviewBtn = document.getElementById('btn-modal-countdown-preview');
  const cdStopBtn = document.getElementById('btn-modal-countdown-stop');
  const cdTestBtn = document.getElementById('btn-modal-countdown-test');

  // Sync state into inputs
  if (timeoutEnabledChk) {
    timeoutEnabledChk.checked = appState.settings.timeoutSoundEnabled !== false;
    timeoutEnabledChk.onchange = (e) => {
      appState.settings.timeoutSoundEnabled = e.target.checked;
      appState.settings.timeUpSoundEnabled = e.target.checked;
    };
  }

  if (timeoutVolSlider && timeoutVolVal) {
    const vol = typeof appState.settings.timeoutVolume === 'number' ? appState.settings.timeoutVolume : 0.8;
    timeoutVolSlider.value = Math.round(vol * 100);
    timeoutVolVal.textContent = `${Math.round(vol * 100)}%`;
    timeoutVolSlider.oninput = (e) => {
      const v = parseInt(e.target.value, 10);
      timeoutVolVal.textContent = `${v}%`;
      appState.settings.timeoutVolume = v / 100;
      appState.settings.timeUpAudioVolume = v / 100;
    };
  }

  if (timeoutSelect) {
    timeoutSelect.onchange = (e) => {
      appState.settings.activeTimeoutAudioId = e.target.value;
      appState.settings.timeUpAudioType = e.target.value;
      saveToStorage('odpc1_settings', appState.settings);
      renderAudioLibrary();
    };
  }

  if (timeoutFileInput) {
    timeoutFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const validation = validateAudioFile(file);
      if (!validation.valid) {
        if (timeoutUploadStatus) {
          timeoutUploadStatus.textContent = `❌ ${validation.error}`;
          timeoutUploadStatus.style.color = '#ef4444';
        }
        alert(validation.error);
        return;
      }

      if (timeoutUploadStatus) {
        timeoutUploadStatus.textContent = '⏳ กำลังบันทึกไฟล์เสียงลง IndexedDB...';
        timeoutUploadStatus.style.color = '#38bdf8';
      }

      try {
        const audioId = `audio_timeout_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await saveAudio({
          audioId,
          audioName: file.name,
          audioType: file.type || 'audio/mpeg',
          audioSize: file.size,
          audioCategory: 'TIME_UP',
          audioBlob: file,
          uploadedAt: new Date().toISOString(),
          isDefault: false
        });

        appState.settings.activeTimeoutAudioId = audioId;
        appState.settings.timeUpAudioType = audioId;
        saveToStorage('odpc1_settings', appState.settings);

        if (timeoutUploadStatus) {
          timeoutUploadStatus.textContent = `✓ บันทึกสำเร็จ: ${file.name}`;
          timeoutUploadStatus.style.color = '#22c55e';
          setTimeout(() => { if (timeoutUploadStatus) timeoutUploadStatus.textContent = ''; }, 4000);
        }

        await refreshAudioSelectOptions();
        await renderAudioLibrary();
      } catch (err) {
        console.error('[Audio] Upload failed:', err);
        if (timeoutUploadStatus) {
          timeoutUploadStatus.textContent = '❌ เกิดข้อผิดพลาดในการบันทึกไฟล์';
          timeoutUploadStatus.style.color = '#ef4444';
        }
      }
    };
  }

  if (timeoutPreviewBtn) {
    timeoutPreviewBtn.onclick = async () => {
      await playTimeoutSound();
    };
  }

  if (timeoutStopBtn) {
    timeoutStopBtn.onclick = () => stopCurrentPreview();
  }

  if (timeoutTestBtn) {
    timeoutTestBtn.onclick = async () => {
      await playTimeoutSound();
    };
  }

  // Countdown Controls Binding
  if (cdEnabledChk) {
    cdEnabledChk.checked = appState.settings.countdownEnabled !== false;
    cdEnabledChk.onchange = (e) => {
      appState.settings.countdownEnabled = e.target.checked;
    };
  }

  if (cdSoundEnabledChk) {
    cdSoundEnabledChk.checked = appState.settings.countdownSoundEnabled !== false;
    cdSoundEnabledChk.onchange = (e) => {
      appState.settings.countdownSoundEnabled = e.target.checked;
    };
  }

  if (cdDurationSelect) {
    cdDurationSelect.value = String(appState.settings.countdownDuration || 5);
    cdDurationSelect.onchange = (e) => {
      appState.settings.countdownDuration = parseInt(e.target.value, 10) || 5;
    };
  }

  if (cdVolSlider && cdVolVal) {
    const vol = typeof appState.settings.countdownVolume === 'number' ? appState.settings.countdownVolume : 0.8;
    cdVolSlider.value = Math.round(vol * 100);
    cdVolVal.textContent = `${Math.round(vol * 100)}%`;
    cdVolSlider.oninput = (e) => {
      const v = parseInt(e.target.value, 10);
      cdVolVal.textContent = `${v}%`;
      appState.settings.countdownVolume = v / 100;
    };
  }

  if (cdSelect) {
    cdSelect.onchange = (e) => {
      appState.settings.activeCountdownAudioId = e.target.value;
      saveToStorage('odpc1_settings', appState.settings);
      renderAudioLibrary();
    };
  }

  if (cdFileInput) {
    cdFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const validation = validateAudioFile(file);
      if (!validation.valid) {
        if (cdUploadStatus) {
          cdUploadStatus.textContent = `❌ ${validation.error}`;
          cdUploadStatus.style.color = '#ef4444';
        }
        alert(validation.error);
        return;
      }

      if (cdUploadStatus) {
        cdUploadStatus.textContent = '⏳ กำลังบันทึกไฟล์เสียงลง IndexedDB...';
        cdUploadStatus.style.color = '#38bdf8';
      }

      try {
        const audioId = `audio_cd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await saveAudio({
          audioId,
          audioName: file.name,
          audioType: file.type || 'audio/mpeg',
          audioSize: file.size,
          audioCategory: 'COUNTDOWN',
          audioBlob: file,
          uploadedAt: new Date().toISOString(),
          isDefault: false
        });

        appState.settings.activeCountdownAudioId = audioId;
        saveToStorage('odpc1_settings', appState.settings);

        if (cdUploadStatus) {
          cdUploadStatus.textContent = `✓ บันทึกสำเร็จ: ${file.name}`;
          cdUploadStatus.style.color = '#22c55e';
          setTimeout(() => { if (cdUploadStatus) cdUploadStatus.textContent = ''; }, 4000);
        }

        await refreshAudioSelectOptions();
        await renderAudioLibrary();
      } catch (err) {
        console.error('[Audio] Upload countdown audio failed:', err);
        if (cdUploadStatus) {
          cdUploadStatus.textContent = '❌ เกิดข้อผิดพลาดในการบันทึกไฟล์';
          cdUploadStatus.style.color = '#ef4444';
        }
      }
    };
  }

  if (cdPreviewBtn) {
    cdPreviewBtn.onclick = async () => {
      const audioId = cdSelect ? cdSelect.value : (appState.settings.activeCountdownAudioId || 'default');
      const vol = cdVolSlider ? parseInt(cdVolSlider.value, 10) / 100 : 0.8;
      if (audioId === 'default') {
        previewAudio(null, vol, 'COUNTDOWN');
      } else {
        const item = await getAudio(audioId);
        if (item && (item.audioBlob || item.blob)) {
          previewAudio(item.audioBlob || item.blob, vol, 'COUNTDOWN');
        } else {
          previewAudio(null, vol, 'COUNTDOWN');
        }
      }
    };
  }

  if (cdStopBtn) {
    cdStopBtn.onclick = () => stopCurrentPreview();
  }

  if (cdTestBtn) {
    cdTestBtn.onclick = () => {
      const overlay = document.getElementById('giant-countdown-overlay');
      const numEl = document.getElementById('giant-countdown-num');
      const subEl = document.getElementById('giant-countdown-sub');
      if (!overlay || !numEl) return;

      unlockAudio();
      stopCurrentPreview();
      overlay.classList.add('active');

      let step = parseInt(appState.settings.countdownDuration, 10) || 5;
      const vol = typeof appState.settings.countdownVolume === 'number' ? appState.settings.countdownVolume : 0.8;
      const activeCd = appState.settings.activeCountdownAudioId || 'default';

      const updateVisual = (s) => {
        numEl.classList.remove('is-go');
        void numEl.offsetWidth;
        if (s === 0) {
          numEl.textContent = 'GO!';
          numEl.classList.add('is-go');
          if (subEl) subEl.textContent = 'GAME START!';
        } else {
          numEl.textContent = s;
          if (subEl) {
            const subs = { 5: 'GET READY!', 4: 'STAY SHARP!', 3: 'FOCUS!', 2: 'ALMOST THERE!', 1: 'STAND BY!' };
            subEl.textContent = subs[s] || 'GET READY!';
          }
        }
      };

      if (activeCd !== 'default') {
        getAudio(activeCd).then(rec => {
          if (rec && (rec.audioBlob || rec.blob)) {
            playAudioBlob(rec.audioBlob || rec.blob, vol);
          } else {
            playCountdownStep(step, vol);
          }
        });
      } else {
        playCountdownStep(step, vol);
      }

      updateVisual(step);

      const testInterval = setInterval(() => {
        step--;
        if (step > 0) {
          updateVisual(step);
          if (activeCd === 'default') playCountdownStep(step, vol);
        } else if (step === 0) {
          updateVisual(0);
          if (activeCd === 'default') playCountdownStep('GO', vol);
        } else {
          clearInterval(testInterval);
          setTimeout(() => {
            overlay.classList.remove('active');
          }, 800);
        }
      }, 1000);
    };
  }

  // Also sync General Settings modal quick audio section
  const settingTimeoutChk = document.getElementById('setting-timeup-sound-enabled');
  const settingCdChk = document.getElementById('setting-countdown-sound-enabled');
  const settingTimeoutSelect = document.getElementById('setting-timeup-sound-select');
  const settingTimeoutVolSlider = document.getElementById('setting-timeup-volume-slider');
  const settingTimeoutVolVal = document.getElementById('timeup-volume-val');
  const settingPreviewBtn = document.getElementById('btn-preview-timeup-sound');
  const settingStopBtn = document.getElementById('btn-stop-timeup-sound');
  const settingOpenAudioBtn = document.getElementById('btn-open-audio-modal-from-settings');

  if (settingTimeoutChk) {
    settingTimeoutChk.checked = appState.settings.timeoutSoundEnabled !== false;
    settingTimeoutChk.onchange = (e) => {
      appState.settings.timeoutSoundEnabled = e.target.checked;
      appState.settings.timeUpSoundEnabled = e.target.checked;
    };
  }

  if (settingCdChk) {
    settingCdChk.checked = appState.settings.countdownSoundEnabled !== false;
    settingCdChk.onchange = (e) => {
      appState.settings.countdownSoundEnabled = e.target.checked;
    };
  }

  if (settingTimeoutVolSlider && settingTimeoutVolVal) {
    const vol = typeof appState.settings.timeoutVolume === 'number' ? appState.settings.timeoutVolume : 0.8;
    settingTimeoutVolSlider.value = Math.round(vol * 100);
    settingTimeoutVolVal.textContent = `${Math.round(vol * 100)}%`;
    settingTimeoutVolSlider.oninput = (e) => {
      const v = parseInt(e.target.value, 10);
      settingTimeoutVolVal.textContent = `${v}%`;
      appState.settings.timeoutVolume = v / 100;
      appState.settings.timeUpAudioVolume = v / 100;
    };
  }

  if (settingTimeoutSelect) {
    settingTimeoutSelect.onchange = (e) => {
      appState.settings.activeTimeoutAudioId = e.target.value;
      appState.settings.timeUpAudioType = e.target.value;
      saveToStorage('odpc1_settings', appState.settings);
    };
  }

  if (settingPreviewBtn) {
    settingPreviewBtn.onclick = async () => {
      await playTimeoutSound();
    };
  }

  if (settingStopBtn) {
    settingStopBtn.onclick = () => stopCurrentPreview();
  }

  if (settingOpenAudioBtn) {
    settingOpenAudioBtn.onclick = () => {
      const generalModal = document.getElementById('settings-modal');
      if (generalModal) generalModal.classList.remove('active');
      openAudioSettingsModal();
    };
  }

  await refreshAudioSelectOptions();
  await renderAudioLibrary();
}

// Open Dedicated Audio Settings Modal
export async function openAudioSettingsModal() {
  const modal = document.getElementById('audio-settings-modal');
  if (!modal) return;
  await setupAudioControls('modal');
  modal.classList.add('active');
}

// Save Dedicated Audio Settings Modal
export function saveAudioModalSettings() {
  const timeoutEnabledChk = document.getElementById('modal-timeout-enabled');
  if (timeoutEnabledChk) {
    appState.settings.timeoutSoundEnabled = timeoutEnabledChk.checked;
    appState.settings.timeUpSoundEnabled = timeoutEnabledChk.checked;
  }

  const timeoutSelect = document.getElementById('modal-timeout-select');
  if (timeoutSelect) {
    appState.settings.activeTimeoutAudioId = timeoutSelect.value;
    appState.settings.timeUpAudioType = timeoutSelect.value;
  }

  const timeoutVolSlider = document.getElementById('modal-timeout-volume');
  if (timeoutVolSlider) {
    const v = parseInt(timeoutVolSlider.value, 10) / 100;
    appState.settings.timeoutVolume = v;
    appState.settings.timeUpAudioVolume = v;
  }

  const cdEnabledChk = document.getElementById('modal-countdown-enabled');
  if (cdEnabledChk) appState.settings.countdownEnabled = cdEnabledChk.checked;

  const cdSoundEnabledChk = document.getElementById('modal-countdown-sound-enabled');
  if (cdSoundEnabledChk) appState.settings.countdownSoundEnabled = cdSoundEnabledChk.checked;

  const cdDurationSelect = document.getElementById('modal-countdown-duration');
  if (cdDurationSelect) appState.settings.countdownDuration = parseInt(cdDurationSelect.value, 10) || 5;

  const cdSelect = document.getElementById('modal-countdown-select');
  if (cdSelect) appState.settings.activeCountdownAudioId = cdSelect.value;

  const cdVolSlider = document.getElementById('modal-countdown-volume');
  if (cdVolSlider) appState.settings.countdownVolume = parseInt(cdVolSlider.value, 10) / 100;

  saveToStorage('odpc1_settings', appState.settings);
  stopCurrentPreview();

  const modal = document.getElementById('audio-settings-modal');
  if (modal) modal.classList.remove('active');
}

// History Modal
function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  const body = document.getElementById('history-table-body');
  if (!modal || !body) return;

  if (appState.history.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">ยังไม่มีประวัติการบันทึกคะแนน</td></tr>`;
  } else {
    body.innerHTML = appState.history.map(item => {
      const dt = new Date(item.recordedAt);
      const dateStr = dt.toLocaleDateString('th-TH');
      const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      const ranksSummary = item.scores.map(s => `<strong style="color:#ffffff;">${s.teamName}</strong>: ที่ ${s.rank} (+${s.points})`).join(' • ');

      return `
        <tr>
          <td>${dateStr}</td>
          <td>${timeStr}</td>
          <td><strong style="color:#38bdf8;">${item.gameName}</strong></td>
          <td style="font-size:0.92rem;">${ranksSummary}</td>
          <td>${item.recordedBy}</td>
        </tr>
      `;
    }).join('');
  }

  modal.classList.add('active');
}

// Team Management Modal
function openTeamsModal() {
  const modal = document.getElementById('teams-modal');
  const container = document.getElementById('teams-form-container');
  if (!modal || !container) return;

  container.innerHTML = appState.teams.map(team => {
    const portraitSrc = getLeaderPortraitSrc(team);

    return `
      <div style="border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:18px; margin-bottom:18px; border-left:6px solid ${team.teamColor}; background:rgba(255,255,255,0.03);">
        <h4 style="font-weight:900; color:${team.teamColor}; font-size:1.2rem; margin-bottom:12px;">${team.teamName}</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div class="form-group">
            <label class="form-label">ชื่อทีม</label>
            <input type="text" class="form-input team-edit-name" data-team-id="${team.teamId}" value="${team.teamName}" />
          </div>
          <div class="form-group">
            <label class="form-label">ชื่อหัวหน้าทีม</label>
            <input type="text" class="form-input team-edit-leader" data-team-id="${team.teamId}" value="${team.leaderName}" />
          </div>
        </div>
        <div class="form-group" style="margin-top:10px;">
          <label class="form-label">สโลแกน / คำขวัญประจำทีม (Team Slogan - บันทึกในข้อมูลทีมหลัก ไม่แสดงใน Show Mode/Ranking)</label>
          <input type="text" class="form-input team-edit-slogan" data-team-id="${team.teamId}" value="${team.teamSlogan || ''}" placeholder="ระบุสโลแกนประจำทีม..." />
        </div>
        <div class="form-group" style="margin-top:8px;">
          <label class="form-label">รูปหัวหน้าทีม (Upload Image เพื่อใช้แทนรูป Default)</label>
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:70px; height:70px; border-radius:10px; overflow:hidden; border:2px solid ${team.teamColor}; flex-shrink:0;">
              <img src="${portraitSrc}" id="preview-avatar-${team.teamId}" style="width:100%; height:100%; object-fit:cover;" />
            </div>
            <input type="file" accept="image/*" class="team-image-file-input" data-team-id="${team.teamId}" />
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach image upload listeners
  document.querySelectorAll('.team-image-file-input').forEach(input => {
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const teamId = input.getAttribute('data-team-id');

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        await saveImage(`leader_${teamId}`, dataUrl);
        appState.leaderImages[teamId] = dataUrl;

        // Instant preview
        const pEl = document.getElementById(`preview-avatar-${teamId}`);
        if (pEl) pEl.src = dataUrl;

        renderTeamRankingCards();
        renderScoreProgressionBars();
        updateShowModeView();
      };
      reader.readAsDataURL(file);
    };
  });

  modal.classList.add('active');
}

export async function saveTeamsChanges() {
  document.querySelectorAll('.team-edit-name').forEach(input => {
    const teamId = input.getAttribute('data-team-id');
    const team = appState.teams.find(t => t.teamId === teamId);
    if (team) team.teamName = input.value;
  });
  document.querySelectorAll('.team-edit-leader').forEach(input => {
    const teamId = input.getAttribute('data-team-id');
    const team = appState.teams.find(t => t.teamId === teamId);
    if (team) team.leaderName = input.value;
  });
  document.querySelectorAll('.team-edit-slogan').forEach(input => {
    const teamId = input.getAttribute('data-team-id');
    const team = appState.teams.find(t => t.teamId === teamId);
    if (team) team.teamSlogan = input.value;
  });

  saveToStorage('odpc1_teams', appState.teams);
  document.getElementById('teams-modal').classList.remove('active');
  renderTeamRankingCards();
  renderScoreProgressionBars();
  renderMatrixTable();
  updateShowModeView();
}

// Settings Modal
async function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const nameInput = document.getElementById('setting-event-name');
  if (nameInput) nameInput.value = appState.settings.eventName;

  const dateInput = document.getElementById('setting-event-date');
  if (dateInput) dateInput.value = appState.settings.eventDate;

  const venueInput = document.getElementById('setting-event-venue');
  if (venueInput) venueInput.value = appState.settings.eventVenue;

  const recorderInput = document.getElementById('setting-recorder-name');
  if (recorderInput) recorderInput.value = appState.settings.recorderName || 'คณะกรรมการ';

  const r1 = document.getElementById('setting-score-rank1');
  const r2 = document.getElementById('setting-score-rank2');
  const r3 = document.getElementById('setting-score-rank3');
  const r4 = document.getElementById('setting-score-rank4');
  if (r1) r1.value = appState.scoring.rank1;
  if (r2) r2.value = appState.scoring.rank2;
  if (r3) r3.value = appState.scoring.rank3;
  if (r4) r4.value = appState.scoring.rank4;

  const gamesList = document.getElementById('settings-games-list');
  if (gamesList) {
    gamesList.innerHTML = appState.games.map(game => {
      return `
        <div style="border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:14px; margin-bottom:12px; background:rgba(255,255,255,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="color:#ffffff;">${game.order}. ${game.name}</strong>
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; color:#38bdf8;">
              <span>จับเวลา:</span>
              <input type="checkbox" class="game-timer-toggle" data-game-id="${game.gameId}" ${game.useTimer ? 'checked' : ''} onchange="window.toggleGameTimerSetting('${game.gameId}', this.checked)" />
            </label>
          </div>
          <div id="game-timer-fields-${game.gameId}" style="display: ${game.useTimer ? 'block' : 'none'};">
            <div style="display:flex; align-items:center; gap:10px;">
              <span>ระยะเวลา (นาที):</span>
              <input type="number" class="form-input game-duration-input" data-game-id="${game.gameId}" value="${Math.floor((game.durationSeconds || 600) / 60)}" style="width:100px;" />
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Logo upload - Single Source of Truth
  const logoInput = document.getElementById('setting-logo-input');
  if (logoInput) {
    logoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const url = ev.target.result;
          await saveAppLogo(file, url);
          await saveImage('custom_logo', url);
          appState.customLogoUrl = url;
          updateAllLogos(url);
          showToast(`✅ อัปเดตโลโก้ "${file.name}" ครอบคลุมทุกหน้าจอเรียบร้อยแล้ว`, 'success');
        };
        reader.readAsDataURL(file);
      }
    };
  }

  // Setup audio controls inside Settings Modal
  await setupAudioControls('setting');

  modal.classList.add('active');
}

window.toggleGameTimerSetting = function(gameId, checked) {
  const fields = document.getElementById(`game-timer-fields-${gameId}`);
  if (fields) {
    fields.style.display = checked ? 'block' : 'none';
  }
};

export function saveSettingsChanges() {
  appState.settings.eventName = document.getElementById('setting-event-name').value;
  appState.settings.eventDate = document.getElementById('setting-event-date').value;
  appState.settings.eventVenue = document.getElementById('setting-event-venue').value;
  appState.settings.recorderName = document.getElementById('setting-recorder-name').value;

  const timeoutChk = document.getElementById('setting-timeup-sound-enabled');
  if (timeoutChk) {
    appState.settings.timeoutSoundEnabled = timeoutChk.checked;
    appState.settings.timeUpSoundEnabled = timeoutChk.checked;
  }
  const cdChk = document.getElementById('setting-countdown-sound-enabled');
  if (cdChk) {
    appState.settings.countdownSoundEnabled = cdChk.checked;
  }
  const timeoutSel = document.getElementById('setting-timeup-sound-select');
  if (timeoutSel) {
    appState.settings.activeTimeoutAudioId = timeoutSel.value;
    appState.settings.timeUpAudioType = timeoutSel.value;
  }
  const timeoutVol = document.getElementById('setting-timeup-volume-slider');
  if (timeoutVol) {
    const v = parseInt(timeoutVol.value, 10) / 100;
    appState.settings.timeoutVolume = v;
    appState.settings.timeUpAudioVolume = v;
  }
  saveToStorage('odpc1_settings', appState.settings);
  stopCurrentPreview();

  appState.scoring.rank1 = parseInt(document.getElementById('setting-score-rank1').value, 10) || 3;
  appState.scoring.rank2 = parseInt(document.getElementById('setting-score-rank2').value, 10) || 2;
  appState.scoring.rank3 = parseInt(document.getElementById('setting-score-rank3').value, 10) || 1;
  appState.scoring.rank4 = parseInt(document.getElementById('setting-score-rank4').value, 10) || 1;
  saveToStorage('odpc1_scoring', appState.scoring);

  // Recalculate results
  Object.keys(appState.results).forEach(gameId => {
    const scores = appState.results[gameId];
    if (Array.isArray(scores)) {
      scores.forEach(s => {
        s.points = appState.scoring[`rank${s.rank}`] || 1;
      });
    }
  });
  saveToStorage('odpc1_results', appState.results);

  document.querySelectorAll('.game-timer-toggle').forEach(chk => {
    const gameId = chk.getAttribute('data-game-id');
    const game = appState.games.find(g => g.gameId === gameId);
    if (game) game.useTimer = chk.checked;
  });

  document.querySelectorAll('.game-duration-input').forEach(input => {
    const gameId = input.getAttribute('data-game-id');
    const game = appState.games.find(g => g.gameId === gameId);
    if (game) {
      const mins = parseInt(input.value, 10) || 10;
      game.durationSeconds = mins * 60;
    }
  });
  saveToStorage('odpc1_games', appState.games);

  document.getElementById('settings-modal').classList.remove('active');
  renderHeader();
  renderHeroArea();
  renderTeamRankingCards();
  renderScoreProgressionBars();
  renderMatrixTable();
  renderTimerWidget();
  updateShowModeView();
}

// Helper to convert Blob to Base64 dataURL
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

// Helper to convert Base64 dataURL to Blob
function dataUrlToBlob(dataUrl, fallbackMime = 'audio/mpeg') {
  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.includes(',')) return null;
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.warn('[Import] Error converting dataUrl to Blob:', err);
    return null;
  }
}

// Export Complete Data & Binary Assets (Images, Logo, Custom Audio Files)
export async function exportDataJSON() {
  const images = await getAllImages();

  // Clean images for JSON serialization (ensure logo blob object has string dataUrl)
  const cleanImages = {};
  if (images && typeof images === 'object') {
    for (const [key, val] of Object.entries(images)) {
      if (typeof val === 'string') {
        cleanImages[key] = val;
      } else if (val && typeof val === 'object' && val.dataUrl) {
        cleanImages[key] = val.dataUrl;
      }
    }
  }

  // Include binary audio files by converting blobs to Base64 dataUrls
  const allAudioItems = await getAllAudio();
  const serializedAudio = [];
  if (Array.isArray(allAudioItems)) {
    for (const item of allAudioItems) {
      const blob = item.audioBlob || item.blob;
      let dataUrl = '';
      if (blob instanceof Blob) {
        try {
          dataUrl = await blobToDataUrl(blob);
        } catch (err) {
          console.warn('[Export] Could not serialize audio blob:', item.audioId, err);
        }
      }
      serializedAudio.push({
        audioId: item.audioId,
        audioName: item.audioName,
        category: item.category,
        audioType: item.audioType || 'audio/mpeg',
        audioSize: item.audioSize || 0,
        uploadedAt: item.uploadedAt || new Date().toISOString(),
        dataUrl
      });
    }
  }

  const exportPayload = {
    appName: 'ODPC1 FRIENDSHIP GAMES 2026',
    exportDate: new Date().toISOString(),
    version: '2026.1.0',
    includesBinaryAssets: true,
    settings: appState.settings,
    scoring: appState.scoring,
    teams: appState.teams,
    games: appState.games,
    results: appState.results,
    history: appState.history,
    images: cleanImages,
    audios: serializedAudio
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = url;
  downloadAnchor.download = `ODPC1_GAMES_COMPLETE_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(url);
}

// Import Complete Data & Restore Binary Assets (Images, Logo, Custom Audio Files)
export async function importDataJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.teams && data.games) {
        if (data.settings) saveToStorage('odpc1_settings', data.settings);
        if (data.scoring) saveToStorage('odpc1_scoring', data.scoring);
        if (data.teams) saveToStorage('odpc1_teams', data.teams);
        if (data.games) saveToStorage('odpc1_games', data.games);
        if (data.results) saveToStorage('odpc1_results', data.results);
        if (data.history) saveToStorage('odpc1_history', data.history);

        // Restore Images & Logo
        if (data.images && typeof data.images === 'object') {
          for (const [key, val] of Object.entries(data.images)) {
            if (typeof val === 'string') {
              await saveImage(key, val);
              if (key === 'appLogo' || key === 'custom_logo') {
                const imgBlob = dataUrlToBlob(val, 'image/png');
                if (imgBlob) {
                  await saveAppLogo(imgBlob, val);
                }
              }
            }
          }
        }

        // Restore Audio files into IndexedDB
        if (data.audios && Array.isArray(data.audios)) {
          for (const item of data.audios) {
            if (item.dataUrl) {
              const audioBlob = dataUrlToBlob(item.dataUrl, item.audioType || 'audio/mpeg');
              if (audioBlob) {
                await saveAudio({
                  audioId: item.audioId,
                  audioName: item.audioName,
                  category: item.category,
                  audioBlob: audioBlob,
                  audioType: item.audioType || audioBlob.type || 'audio/mpeg',
                  audioSize: item.audioSize || audioBlob.size,
                  uploadedAt: item.uploadedAt || new Date().toISOString()
                });
              }
            }
          }
        }

        alert('✅ นำเข้าข้อมูลและไฟล์สื่อทั้งหมดสำเร็จ! (Settings, Teams, Scores, Logo, Leader Images, Audio Files)\nกำลังรีโหลดระบบ...');
        window.location.reload();
      } else {
        alert('⚠️ รูปแบบไฟล์ JSON ไม่ถูกต้อง: ไม่พบข้อมูลทีมหรือตารางเกม');
      }
    } catch (err) {
      alert('❌ เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Safe Reset Competition Function: Clear ONLY competition results and history
export function promptResetCompetitionScores() {
  const modal = document.getElementById('reset-scores-modal');
  if (modal) {
    modal.classList.add('active');
  } else {
    if (confirm('ต้องการล้างผลการแข่งขันทั้งหมดและเริ่มคะแนนใหม่ที่ 0 ใช่หรือไม่?')) {
      confirmResetCompetitionScores();
    }
  }
}

export function confirmResetCompetitionScores() {
  // Reset ONLY competition results and history
  appState.results = {};
  appState.history = [];
  appState.currentLeaderId = null;
  appState.previousScores = {};
  appState.teams.forEach(t => {
    appState.previousScores[t.teamId] = 0;
  });

  // Persist empty results and empty history
  saveToStorage('odpc1_results', {});
  saveToStorage('odpc1_history', []);

  // Update all views
  renderHeroArea();
  renderTeamRankingCards();
  renderScoreProgressionBars();
  renderMatrixTable();
  updateShowModeView();
  renderHeader();

  // Close modal
  const modal = document.getElementById('reset-scores-modal');
  if (modal) {
    modal.classList.remove('active');
  }

  showToast('✅ ล้างคะแนนการแข่งขันเรียบร้อยแล้ว ทุกทีมเริ่มต้นที่ 0 แต้ม', 'success');
}

// 2-Step Reset Confirmation
export function showResetModal() {
  const modal = document.getElementById('reset-modal');
  if (modal) {
    document.getElementById('reset-confirm-input').value = '';
    document.getElementById('reset-step-2').style.display = 'none';
    document.getElementById('btn-reset-step-1').style.display = 'inline-flex';
    modal.classList.add('active');
  }
}

export function proceedResetStep2() {
  document.getElementById('btn-reset-step-1').style.display = 'none';
  document.getElementById('reset-step-2').style.display = 'block';
}

export async function executeFinalReset(resetMode) {
  const typed = document.getElementById('reset-confirm-input').value.trim();
  if (typed !== 'RESET') {
    alert('กรุณาพิมพ์คำว่า RESET ให้ถูกต้องเพื่อยืนยัน');
    return;
  }

  // Clear ONLY competition scores and history - protect team master data, logo, audio, settings!
  appState.results = {};
  appState.history = [];
  appState.currentLeaderId = null;
  appState.previousScores = {};
  appState.teams.forEach(t => {
    appState.previousScores[t.teamId] = 0;
  });

  saveToStorage('odpc1_results', {});
  saveToStorage('odpc1_history', []);

  const modal = document.getElementById('reset-modal');
  if (modal) modal.classList.remove('active');

  renderHeroArea();
  renderTeamRankingCards();
  renderScoreProgressionBars();
  renderMatrixTable();
  updateShowModeView();
  renderHeader();

  showToast('✅ รีเซ็ตผลการแข่งขันเรียบร้อยแล้ว ทุกทีมเริ่มต้นที่ 0 แต้ม', 'success');
}

// Make functions globally available for inline event handlers
window.promptResetCompetitionScores = promptResetCompetitionScores;
window.confirmResetCompetitionScores = confirmResetCompetitionScores;
window.saveSettingsChanges = saveSettingsChanges;
window.saveTeamsChanges = saveTeamsChanges;
window.exportDataJSON = exportDataJSON;
window.importDataJSON = importDataJSON;
window.showResetModal = showResetModal;
window.proceedResetStep2 = proceedResetStep2;
window.executeFinalReset = executeFinalReset;
window.openAudioSettingsModal = openAudioSettingsModal;
window.saveAudioModalSettings = saveAudioModalSettings;
window.openFullscreenTimerOverlay = openFullscreenTimerOverlay;
window.closeFullscreenTimerOverlay = closeFullscreenTimerOverlay;
window.deleteCurrentGameScore = deleteCurrentGameScore;
window.playTimeoutSound = playTimeoutSound;

// Auto-boot on load
document.addEventListener('DOMContentLoaded', initApp);
