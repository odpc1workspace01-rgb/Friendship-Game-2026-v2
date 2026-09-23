/**
 * ODPC1 FRIENDSHIP GAMES 2026 - High-Resolution Balanced Leader Portraits
 * High-fidelity vector illustrations for the 4 team leaders (calibrated for 1080p and 4K)
 * Standardized 4:5 portrait aspect ratio with matched head proportions, eye-line, and collar framing.
 */

export const DEFAULT_LEADER_AVATARS = {
  yellow: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="100%" height="100%">
    <defs>
      <linearGradient id="bgY" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%231e293b"/>
        <stop offset="50%" stop-color="%230f172a"/>
        <stop offset="100%" stop-color="%2378350f"/>
      </linearGradient>
      <radialGradient id="auraY" cx="50%" cy="38%" r="48%">
        <stop offset="0%" stop-color="%23eab308" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="%23eab308" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="jacketY" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23facc15"/>
        <stop offset="100%" stop-color="%23ca8a04"/>
      </linearGradient>
    </defs>
    <rect width="400" height="500" fill="url(%23bgY)"/>
    <circle cx="200" cy="190" r="150" fill="url(%23auraY)"/>
    <circle cx="200" cy="190" r="135" stroke="%23facc15" stroke-width="2" stroke-dasharray="8 6" fill="none" opacity="0.4"/>
    <!-- Blazer / Uniform -->
    <path d="M60 500 L105 330 L160 305 L200 355 L240 305 L295 330 L340 500 Z" fill="url(%23jacketY)"/>
    <path d="M160 305 L200 355 L240 305 L220 500 L180 500 Z" fill="%230f172a"/>
    <!-- Gold Tie & White Collar -->
    <polygon points="180,305 200,345 220,305" fill="%23ffffff"/>
    <polygon points="185,345 215,345 208,445 200,460 192,445" fill="%23eab308"/>
    <!-- Neck -->
    <rect x="175" y="240" width="50" height="70" rx="10" fill="%23fcd34d"/>
    <!-- Head -->
    <ellipse cx="200" cy="190" rx="65" ry="76" fill="%23fde047"/>
    <!-- Hair (Dr. Witthawat) -->
    <path d="M135 180 C135 105, 265 105, 265 180 C265 125, 240 98, 200 98 C160 98, 135 125, 135 180 Z" fill="%231e293b"/>
    <!-- Executive Glasses -->
    <rect x="150" y="172" width="40" height="26" rx="6" stroke="%230f172a" stroke-width="5" fill="rgba(255,255,255,0.4)"/>
    <rect x="210" y="172" width="40" height="26" rx="6" stroke="%230f172a" stroke-width="5" fill="rgba(255,255,255,0.4)"/>
    <line x1="190" y1="185" x2="210" y2="185" stroke="%230f172a" stroke-width="5"/>
    <!-- Smile -->
    <path d="M182 230 Q200 244 218 230" stroke="%23b45309" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- Team Badge -->
    <g transform="translate(100, 360)">
      <circle cx="18" cy="18" r="22" fill="%230f172a" stroke="%23facc15" stroke-width="3"/>
      <path d="M18 7 L21 15 L29 16 L23 22 L25 30 L18 25 L11 30 L13 22 L7 16 L15 15 Z" fill="%23facc15"/>
    </g>
  </svg>`,

  blue: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="100%" height="100%">
    <defs>
      <linearGradient id="bgB" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%230f172a"/>
        <stop offset="50%" stop-color="%230c2340"/>
        <stop offset="100%" stop-color="%231e3a8a"/>
      </linearGradient>
      <radialGradient id="auraB" cx="50%" cy="38%" r="48%">
        <stop offset="0%" stop-color="%2338bdf8" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="%232563eb" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="jacketB" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%233b82f6"/>
        <stop offset="100%" stop-color="%231d4ed8"/>
      </linearGradient>
    </defs>
    <rect width="400" height="500" fill="url(%23bgB)"/>
    <circle cx="200" cy="190" r="150" fill="url(%23auraB)"/>
    <circle cx="200" cy="190" r="135" stroke="%2338bdf8" stroke-width="2" stroke-dasharray="8 6" fill="none" opacity="0.4"/>
    <!-- Blazer / Uniform -->
    <path d="M60 500 L105 330 L160 305 L200 355 L240 305 L295 330 L340 500 Z" fill="url(%23jacketB)"/>
    <path d="M160 305 L200 355 L240 305 L220 500 L180 500 Z" fill="%230f172a"/>
    <!-- Blue Tie & White Collar -->
    <polygon points="180,305 200,345 220,305" fill="%23ffffff"/>
    <polygon points="185,345 215,345 208,445 200,460 192,445" fill="%2338bdf8"/>
    <!-- Neck -->
    <rect x="175" y="240" width="50" height="70" rx="10" fill="%23fed7aa"/>
    <!-- Head -->
    <ellipse cx="200" cy="190" rx="65" ry="76" fill="%23ffedd5"/>
    <!-- Hair (Dr. Sasithorn) -->
    <path d="M130 185 C130 98, 270 98, 270 185 C280 235, 268 275, 258 285 C248 210, 240 120, 200 120 C160 120, 152 210, 142 285 C132 275, 120 235, 130 185 Z" fill="%231e293b"/>
    <!-- Eyes -->
    <ellipse cx="178" cy="184" rx="6" ry="7" fill="%231e293b"/>
    <ellipse cx="222" cy="184" rx="6" ry="7" fill="%231e293b"/>
    <!-- Smile -->
    <path d="M182 228 Q200 242 218 228" stroke="%23c2410c" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- Team Badge -->
    <g transform="translate(100, 360)">
      <circle cx="18" cy="18" r="22" fill="%230f172a" stroke="%2338bdf8" stroke-width="3"/>
      <path d="M10 22 Q18 10 28 14 Q22 22 18 28 Z" fill="%2338bdf8"/>
    </g>
  </svg>`,

  red: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="100%" height="100%">
    <defs>
      <linearGradient id="bgR" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23180505"/>
        <stop offset="50%" stop-color="%23450a0a"/>
        <stop offset="100%" stop-color="%237f1d1d"/>
      </linearGradient>
      <radialGradient id="auraR" cx="50%" cy="38%" r="48%">
        <stop offset="0%" stop-color="%23f87171" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="%23dc2626" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="jacketR" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23ef4444"/>
        <stop offset="100%" stop-color="%23b91c1c"/>
      </linearGradient>
    </defs>
    <rect width="400" height="500" fill="url(%23bgR)"/>
    <circle cx="200" cy="190" r="150" fill="url(%23auraR)"/>
    <circle cx="200" cy="190" r="135" stroke="%23f87171" stroke-width="2" stroke-dasharray="8 6" fill="none" opacity="0.4"/>
    <!-- Blazer / Uniform -->
    <path d="M60 500 L105 330 L160 305 L200 355 L240 305 L295 330 L340 500 Z" fill="url(%23jacketR)"/>
    <path d="M160 305 L200 355 L240 305 L220 500 L180 500 Z" fill="%230f172a"/>
    <!-- Red Tie & White Collar -->
    <polygon points="180,305 200,345 220,305" fill="%23ffffff"/>
    <polygon points="185,345 215,345 208,445 200,460 192,445" fill="%23fca5a5"/>
    <!-- Neck -->
    <rect x="175" y="240" width="50" height="70" rx="10" fill="%23fed7aa"/>
    <!-- Head -->
    <ellipse cx="200" cy="190" rx="65" ry="76" fill="%23ffedd5"/>
    <!-- Hair (Sorawit) -->
    <path d="M132 180 C132 98, 268 98, 268 180 C268 118, 245 90, 200 90 C155 90, 132 118, 132 180 Z" fill="%231e293b"/>
    <!-- Eyes -->
    <ellipse cx="178" cy="184" rx="6" ry="7" fill="%231e293b"/>
    <ellipse cx="222" cy="184" rx="6" ry="7" fill="%231e293b"/>
    <!-- Smile -->
    <path d="M182 228 Q200 242 218 228" stroke="%23991b1b" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- Team Badge -->
    <g transform="translate(100, 360)">
      <circle cx="18" cy="18" r="22" fill="%230f172a" stroke="%23ef4444" stroke-width="3"/>
      <path d="M18 8 C20 14 26 18 24 26 C22 30 14 30 12 26 C10 22 16 18 18 8 Z" fill="%23ef4444"/>
    </g>
  </svg>`,

  purple: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="100%" height="100%">
    <defs>
      <linearGradient id="bgP" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%231a0826"/>
        <stop offset="50%" stop-color="%233b0764"/>
        <stop offset="100%" stop-color="%23581c87"/>
      </linearGradient>
      <radialGradient id="auraP" cx="50%" cy="38%" r="48%">
        <stop offset="0%" stop-color="%23c084fc" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="%239333ea" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="jacketP" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23a855f7"/>
        <stop offset="100%" stop-color="%237e22ce"/>
      </linearGradient>
    </defs>
    <rect width="400" height="500" fill="url(%23bgP)"/>
    <circle cx="200" cy="190" r="150" fill="url(%23auraP)"/>
    <circle cx="200" cy="190" r="135" stroke="%23c084fc" stroke-width="2" stroke-dasharray="8 6" fill="none" opacity="0.4"/>
    <!-- Blazer / Uniform -->
    <path d="M60 500 L105 330 L160 305 L200 355 L240 305 L295 330 L340 500 Z" fill="url(%23jacketP)"/>
    <path d="M160 305 L200 355 L240 305 L220 500 L180 500 Z" fill="%230f172a"/>
    <!-- Purple Tie & White Collar -->
    <polygon points="180,305 200,345 220,305" fill="%23ffffff"/>
    <polygon points="185,345 215,345 208,445 200,460 192,445" fill="%23e9d5ff"/>
    <!-- Neck -->
    <rect x="175" y="240" width="50" height="70" rx="10" fill="%23fed7aa"/>
    <!-- Head -->
    <ellipse cx="200" cy="190" rx="65" ry="76" fill="%23ffedd5"/>
    <!-- Hair (Dr. Chalita) -->
    <path d="M130 185 C130 98, 270 98, 270 185 C275 225, 260 275, 250 285 C245 205, 235 125, 200 125 C165 125, 155 205, 150 285 C140 275, 125 225, 130 185 Z" fill="%231e293b"/>
    <!-- Executive Glasses -->
    <rect x="152" y="172" width="38" height="24" rx="6" stroke="%239333ea" stroke-width="4" fill="rgba(255,255,255,0.45)"/>
    <rect x="210" y="172" width="38" height="24" rx="6" stroke="%239333ea" stroke-width="4" fill="rgba(255,255,255,0.45)"/>
    <line x1="190" y1="184" x2="210" y2="184" stroke="%239333ea" stroke-width="4"/>
    <!-- Smile -->
    <path d="M182 228 Q200 240 218 228" stroke="%236b21a8" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- Team Badge -->
    <g transform="translate(100, 360)">
      <circle cx="18" cy="18" r="22" fill="%230f172a" stroke="%23c084fc" stroke-width="3"/>
      <path d="M18 10 Q26 18 22 26 Q18 22 14 26 Q10 18 18 10 Z" fill="%23c084fc"/>
    </g>
  </svg>`
};
