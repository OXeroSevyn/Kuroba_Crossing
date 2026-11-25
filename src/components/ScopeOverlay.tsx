import React from 'react';
import type { ReticleKind, ScopeHudState } from '../game/types';

/**
 * Reticle drawn in a -100..100 viewBox around the aim point.
 */
const Reticle: React.FC<{ kind: ReticleKind; color: string; zoom: number }> = ({ kind, color, zoom }) => {
  const dark = '#05070a';
  switch (kind) {
    case 'mildot':
      return (
        <g>
          <g stroke={dark} strokeWidth="1.4">
            <line x1="-100" y1="0" x2="-6" y2="0" />
            <line x1="6" y1="0" x2="100" y2="0" />
            <line x1="0" y1="-100" x2="0" y2="-6" />
            <line x1="0" y1="6" x2="0" y2="100" />
            <line x1="-100" y1="0" x2="-62" y2="0" strokeWidth="4" />
            <line x1="62" y1="0" x2="100" y2="0" strokeWidth="4" />
            <line x1="0" y1="62" x2="0" y2="100" strokeWidth="4" />
          </g>
          {[-48, -36, -24, -12, 12, 24, 36, 48].map((d) => (
            <g key={d} fill={dark}>
              <circle cx={d} cy="0" r="1.6" />
              <circle cx="0" cy={d} r="1.6" />
            </g>
          ))}
          <circle cx="0" cy="0" r="1.3" fill={color} />
          {/* bullet-drop stadia */}
          {[18, 30, 42].map((d, i) => (
            <line key={d} x1={-8 + i * 1.5} y1={d} x2={8 - i * 1.5} y2={d} stroke={dark} strokeWidth="1" />
          ))}
        </g>
      );
    case 'chevron':
      return (
        <g>
          <path d="M-9 9 L0 -1 L9 9" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="miter" />
          <line x1="0" y1="10" x2="0" y2="60" stroke={dark} strokeWidth="1.6" />
          {[24, 36, 48].map((d, i) => (
            <line key={d} x1={-6 + i} y1={d} x2={6 - i} y2={d} stroke={dark} strokeWidth="1.4" />
          ))}
          <line x1="-100" y1="0" x2="-40" y2="0" stroke={dark} strokeWidth="1.6" />
          <line x1="40" y1="0" x2="100" y2="0" stroke={dark} strokeWidth="1.6" />
        </g>
      );
    case 'pgo':
      return (
        <g stroke={color} strokeWidth="1.6" fill="none">
          <path d="M-6 -4 L0 4 L6 -4" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line x1={-26 + i * 2} y1={14 + i * 10} x2={-10} y2={14 + i * 10} />
              <text x={-34 + i * 2} y={17 + i * 10} fill={color} stroke="none" fontSize="6" fontFamily="monospace" textAnchor="end">
                {(i + 2) * 100}
              </text>
            </g>
          ))}
          <line x1="-40" y1="0" x2="-14" y2="0" />
          <line x1="14" y1="0" x2="40" y2="0" />
        </g>
      );
    case 'smart':
      return (
        <g stroke={color} strokeWidth="1.4" fill="none">
          <circle cx="0" cy="0" r="18" strokeDasharray="6 4" />
          <rect x="-4" y="-4" width="8" height="8" />
          <path d="M-30 -22 L-30 -30 L-22 -30 M22 -30 L30 -30 L30 -22 M30 22 L30 30 L22 30 M-22 30 L-30 30 L-30 22" />
          <line x1="-60" y1="0" x2="-24" y2="0" />
          <line x1="24" y1="0" x2="60" y2="0" />
        </g>
      );
    case 'thermal':
      return (
        <g stroke={color} strokeWidth="1.4" fill="none">
          <line x1="-70" y1="0" x2="-8" y2="0" />
          <line x1="8" y1="0" x2="70" y2="0" />
          <line x1="0" y1="8" x2="0" y2="70" />
          <circle cx="0" cy="0" r="2" fill={color} />
          <rect x="-72" y="-48" width="144" height="96" strokeDasharray="2 6" opacity="0.6" />
        </g>
      );
    case 'holo':
      return (
        <g stroke={color} strokeWidth={zoom > 1.45 ? 1.4 : 1.8} fill="none">
          <circle cx="0" cy="0" r="14" />
          <circle cx="0" cy="0" r="1.8" fill={color} />
          <line x1="0" y1="-14" x2="0" y2="-9" />
          <line x1="0" y1="14" x2="0" y2="9" />
          <line x1="-14" y1="0" x2="-9" y2="0" />
          <line x1="14" y1="0" x2="9" y2="0" />
        </g>
      );
    case 'dot':
      return (
        <g>
          <circle cx="0" cy="0" r="2.6" fill={color} />
          <circle cx="0" cy="0" r="5" fill={color} opacity="0.25" />
        </g>
      );
    default:
      // iron sights: rear aperture ring + front post
      return (
        <g>
          <circle cx="0" cy="2" r="11" fill="none" stroke="#1a1d22" strokeWidth="5" opacity="0.85" />
          <rect x="-1.6" y="-1" width="3.2" height="14" fill="#1a1d22" />
          <rect x="-1.2" y="-1.5" width="2.4" height="2.4" fill="#facc15" />
        </g>
      );
  }
};

/** Small reticle used while aiming with 1x-1.6x optics (third-person ADS). */
export const AdsReticle: React.FC<{ scope: ScopeHudState; spreadPx: number }> = ({ scope, spreadPx }) => (
  <svg viewBox="-48 -48 96 96" className="w-24 h-24 overflow-visible" style={{ opacity: Math.min(1, scope.blend * 1.6) }}>
    <g style={{ filter: `drop-shadow(0 0 3px ${scope.reticleColor})` }}>
      <Reticle kind={scope.reticle} color={scope.reticleColor} zoom={scope.zoom} />
    </g>
    {spreadPx > 9 && <circle cx="0" cy="0" r={spreadPx} fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1" />}
  </svg>
);

/** Full-screen scope view for 2x+ optics. */
export const ScopeOverlay: React.FC<{ scope: ScopeHudState; hitmarker: boolean; hitmarkerCrit: boolean }> = ({
  scope,
  hitmarker,
  hitmarkerCrit,
}) => {
  const isThermal = scope.reticle === 'thermal';
  return (
    <div className="fixed inset-0 pointer-events-none" aria-hidden="true" style={{ animation: 'scope-in 140ms ease-out' }}>
      <style>{`@keyframes scope-in { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: scale(1); } }`}</style>
      <svg className="absolute inset-0 w-full h-full" viewBox="-100 -60 200 120" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="scope-glass" cx="0" cy="0" r="52" gradientUnits="userSpaceOnUse">
            <stop offset="0.7" stopColor="#000" stopOpacity="0" />
            <stop offset="0.93" stopColor="#000" stopOpacity="0.55" />
            <stop offset="1" stopColor="#000" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="scope-glint" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.09" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Black housing with a round lens cut out (even-odd fill) */}
        <path d="M-300 -300 H300 V300 H-300 Z M52 0 A52 52 0 1 0 -52 0 A52 52 0 1 0 52 0 Z" fill="#020304" fillRule="evenodd" />
        <circle cx="0" cy="0" r="52" fill="url(#scope-glass)" />
        <circle cx="0" cy="0" r="52" fill={isThermal ? 'rgba(80,140,160,0.06)' : 'url(#scope-glint)'} />
        <circle cx="0" cy="0" r="52.3" fill="none" stroke="#1a1d22" strokeWidth="1.4" />
        <g transform="scale(0.52)">
          <Reticle kind={scope.reticle} color={scope.reticleColor} zoom={scope.zoom} />
        </g>
        {hitmarker && (
          <g stroke={hitmarkerCrit ? '#ffe066' : '#ff4d3b'} strokeWidth="0.9" strokeLinecap="square">
            <line x1="-5" y1="-5" x2="-2.5" y2="-2.5" />
            <line x1="5" y1="-5" x2="2.5" y2="-2.5" />
            <line x1="-5" y1="5" x2="-2.5" y2="2.5" />
            <line x1="5" y1="5" x2="2.5" y2="2.5" />
          </g>
        )}
      </svg>

      {/* Readouts along the lens edge */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 font-mono text-[11px] tracking-widest text-white/80" style={{ marginTop: 'min(40vh, 40vw)' }}>
        <div className="flex items-center gap-4 px-3 py-1 rounded bg-black/60 border border-white/10">
          <span className="text-amber-300">{scope.zoom.toFixed(1)}x</span>
          <span>{scope.rangeM !== null ? `${scope.rangeM} m` : '--- m'}</span>
          <span className="text-white/50">{scope.opticName.toUpperCase()}</span>
          {scope.variableZoom && <span className="text-emerald-300">SCROLL ZOOM</span>}
        </div>
      </div>
    </div>
  );
};
