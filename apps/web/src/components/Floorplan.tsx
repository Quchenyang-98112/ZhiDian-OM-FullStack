import { Droplets, Lightbulb, Moon, Sun, Thermometer, Wind } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomState {
  lights: boolean;
  dimmer: number;
  temp: number;
  setpoint: number;
  windowOpen: boolean;
  humidity: number;
}

const DEFAULT_ROOMS: Record<string, RoomState> = {
  kitchen: { lights: false, dimmer: 100, temp: 22.0, setpoint: 21, windowOpen: true, humidity: 55 },
  bathroom: {
    lights: false,
    dimmer: 60,
    temp: 23.5,
    setpoint: 24,
    windowOpen: false,
    humidity: 72,
  },
  living: { lights: true, dimmer: 80, temp: 21.5, setpoint: 22, windowOpen: false, humidity: 48 },
  bedroom: { lights: false, dimmer: 30, temp: 19.8, setpoint: 19, windowOpen: true, humidity: 45 },
  office: { lights: true, dimmer: 90, temp: 21.0, setpoint: 21, windowOpen: false, humidity: 42 },
};

const ROOM_GA: Record<
  string,
  { light: string; dim: string; temp: string; setpoint: string; window: string }
> = {
  kitchen: { light: '1/1/0', dim: '1/1/1', temp: '3/1/0', setpoint: '2/1/0', window: '3/1/1' },
  bathroom: { light: '1/2/0', dim: '1/2/1', temp: '3/2/0', setpoint: '2/2/0', window: '3/2/1' },
  living: { light: '1/3/0', dim: '1/3/1', temp: '3/3/0', setpoint: '2/3/0', window: '3/3/1' },
  bedroom: { light: '1/4/0', dim: '1/4/1', temp: '3/4/0', setpoint: '2/4/0', window: '3/4/1' },
  office: { light: '1/5/0', dim: '1/5/1', temp: '3/5/0', setpoint: '2/5/0', window: '3/5/1' },
};

const ROOM_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  kitchen: { x: 34, y: 34, w: 292, h: 212 },
  bathroom: { x: 34, y: 254, w: 292, h: 212 },
  living: { x: 334, y: 34, w: 262, h: 432 },
  bedroom: { x: 604, y: 34, w: 262, h: 242 },
  office: { x: 604, y: 284, w: 262, h: 182 },
};

const ROOM_CENTERS: Record<string, { x: number; y: number }> = {
  kitchen: { x: 180, y: 140 },
  bathroom: { x: 180, y: 360 },
  living: { x: 465, y: 250 },
  bedroom: { x: 735, y: 155 },
  office: { x: 735, y: 375 },
};

const ROOM_ICONS: Record<string, string> = {
  kitchen: '🍳',
  bathroom: '🚿',
  living: '🛋',
  bedroom: '🛏',
  office: '💻',
};

export function Floorplan() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<Record<string, RoomState>>(DEFAULT_ROOMS);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const updateRoom = (id: string, patch: Partial<RoomState>) => {
    setRooms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const roomLabels: Record<string, string> = {
    kitchen: t('floorplan.kitchen'),
    bathroom: t('floorplan.bathroom'),
    living: t('floorplan.livingRoom'),
    bedroom: t('floorplan.bedroom'),
    office: t('floorplan.office'),
  };

  return (
    <section className="relative w-full" aria-label={t('dashboard.floorplan')}>
      {/* SVG Floorplan — 5 rooms */}
      <svg
        viewBox="0 0 900 500"
        className="w-full opacity-80"
        preserveAspectRatio="xMidYMid meet"
        aria-label={t('floorplan.interactiveView')}
      >
        <title>{t('dashboard.floorplan')}</title>
        {/* Outer walls */}
        <rect
          x="30"
          y="30"
          width="840"
          height="440"
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="8"
          rx="4"
        />
        {/* Vertical dividers */}
        <line x1="330" y1="30" x2="330" y2="470" stroke="var(--color-muted)" strokeWidth="6" />
        <line x1="600" y1="30" x2="600" y2="470" stroke="var(--color-muted)" strokeWidth="6" />
        {/* Horizontal dividers */}
        <line x1="30" y1="250" x2="330" y2="250" stroke="var(--color-muted)" strokeWidth="6" />
        <line x1="600" y1="280" x2="870" y2="280" stroke="var(--color-muted)" strokeWidth="6" />

        {/* Door gaps */}
        <line
          x1="330"
          y1="160"
          x2="330"
          y2="210"
          stroke="var(--color-bg, #0f172a)"
          strokeWidth="8"
        />
        <line
          x1="330"
          y1="330"
          x2="330"
          y2="380"
          stroke="var(--color-bg, #0f172a)"
          strokeWidth="8"
        />
        <line
          x1="600"
          y1="140"
          x2="600"
          y2="190"
          stroke="var(--color-bg, #0f172a)"
          strokeWidth="8"
        />
        <line
          x1="600"
          y1="340"
          x2="600"
          y2="390"
          stroke="var(--color-bg, #0f172a)"
          strokeWidth="8"
        />
        <line
          x1="160"
          y1="250"
          x2="210"
          y2="250"
          stroke="var(--color-bg, #0f172a)"
          strokeWidth="8"
        />

        {/* Windows (colored based on state) */}
        <line
          x1="120"
          y1="30"
          x2="220"
          y2="30"
          stroke={rooms.kitchen.windowOpen ? 'var(--color-primary)' : 'var(--color-muted)'}
          strokeWidth="10"
          className="transition-colors duration-500"
        />
        <line
          x1="700"
          y1="30"
          x2="800"
          y2="30"
          stroke={rooms.bedroom.windowOpen ? 'var(--color-primary)' : 'var(--color-muted)'}
          strokeWidth="10"
          className="transition-colors duration-500"
        />
        <line x1="460" y1="470" x2="540" y2="470" stroke="var(--color-muted)" strokeWidth="10" />

        {/* Light overlays per room */}
        {Object.entries(rooms).map(([id, room]) => {
          const r = ROOM_RECTS[id];
          return (
            <motion.rect
              key={id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="#fef08a"
              initial={{ opacity: 0 }}
              animate={{ opacity: room.lights ? 0.08 + room.dimmer * 0.0012 : 0 }}
              transition={{ duration: 0.5 }}
              className="pointer-events-none"
              rx="2"
            />
          );
        })}

        {/* Room labels + clickable areas */}
        {Object.keys(roomLabels).map((id) => {
          const c = ROOM_CENTERS[id];
          const isSelected = selectedRoom === id;
          return (
            <g key={id}>
              {/* biome-ignore lint/a11y/useSemanticElements: SVG rect with button role cannot be replaced with HTML button inside SVG */}
              <rect
                x={c.x - 70}
                y={c.y - 40}
                width={140}
                height={80}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => setSelectedRoom(isSelected ? null : id)}
                role="button"
                tabIndex={0}
                aria-label={t('accessibility.floorplanRoomStatus', {
                  room: roomLabels[id],
                  temp: rooms[id].temp.toFixed(1),
                  humidity: rooms[id].humidity,
                  light: rooms[id].lights ? t('floorplan.on', 'An') : t('floorplan.off', 'Aus'),
                })}
                aria-expanded={isSelected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRoom(isSelected ? null : id);
                  }
                }}
              />
              {isSelected && (
                <rect
                  x={c.x - 70}
                  y={c.y - 40}
                  width={140}
                  height={80}
                  fill="none"
                  stroke="var(--color-primary, #6366f1)"
                  strokeWidth="2"
                  rx="8"
                  className="pointer-events-none"
                />
              )}
              <text
                x={c.x}
                y={c.y - 8}
                fill="#94a3b8"
                fontSize="18"
                textAnchor="middle"
                fontFamily="Inter"
                fontWeight={isSelected ? 600 : 400}
              >
                {roomLabels[id]}
              </text>
              <text
                x={c.x}
                y={c.y + 18}
                fill={rooms[id].lights ? '#eab308' : '#94a3b8'}
                fontSize="13"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {rooms[id].temp.toFixed(1)}°C · {rooms[id].humidity}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Room control panel */}
      {selectedRoom && rooms[selectedRoom] && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel mt-4 space-y-4 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium text-lg">
              <span className="text-xl" aria-hidden="true">
                {ROOM_ICONS[selectedRoom]}
              </span>
              {roomLabels[selectedRoom]}
            </h3>
            <span className="font-mono text-(--color-muted) text-xs">
              GA {ROOM_GA[selectedRoom].light}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Lights */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => updateRoom(selectedRoom, { lights: !rooms[selectedRoom].lights })}
                className={`focus-ring rounded-full border p-3 transition-all active:scale-[0.93] ${
                  rooms[selectedRoom].lights
                    ? 'border-yellow-400/50 bg-yellow-400/20 text-yellow-300'
                    : 'border-(--color-border) bg-(--color-surface) text-(--color-muted)'
                }`}
                aria-label={t('floorplan.lights')}
                aria-pressed={rooms[selectedRoom].lights}
              >
                <Lightbulb size={22} aria-hidden="true" />
              </button>
              <span className="text-(--color-muted) text-xs">{t('floorplan.lights')}</span>
            </div>

            {/* Window */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  updateRoom(selectedRoom, { windowOpen: !rooms[selectedRoom].windowOpen })
                }
                className={`focus-ring rounded-full border p-3 transition-all active:scale-[0.93] ${
                  rooms[selectedRoom].windowOpen
                    ? 'border-sky-400/50 bg-sky-400/20 text-sky-300'
                    : 'border-(--color-border) bg-(--color-surface) text-(--color-muted)'
                }`}
                aria-label={
                  rooms[selectedRoom].windowOpen
                    ? t('floorplan.windowClose')
                    : t('floorplan.windowOpen')
                }
                aria-pressed={rooms[selectedRoom].windowOpen}
              >
                <Wind size={22} aria-hidden="true" />
              </button>
              <span className="text-(--color-muted) text-xs">{t('floorplan.window')}</span>
            </div>

            {/* Temperature */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2">
                <Thermometer size={16} className="text-orange-400" aria-hidden="true" />
                <span className="font-mono text-sm">{rooms[selectedRoom].temp.toFixed(1)}°</span>
              </div>
              <span className="text-(--color-muted) text-xs">{t('floorplan.actual')}</span>
            </div>

            {/* Humidity */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2">
                <Droplets size={16} className="text-blue-400" aria-hidden="true" />
                <span className="font-mono text-sm">{rooms[selectedRoom].humidity}%</span>
              </div>
              <span className="text-(--color-muted) text-xs">{t('floorplan.humidity')}</span>
            </div>
          </div>

          {/* Dimmer */}
          {rooms[selectedRoom].lights && (
            <div className="space-y-1">
              <label
                htmlFor="floorplan-dimmer-control"
                className="flex items-center gap-1 text-(--color-muted) text-xs"
              >
                <Sun size={12} aria-hidden="true" />
                {t('floorplan.brightness')} · {rooms[selectedRoom].dimmer}%
                <span className="ml-auto font-mono text-(--color-muted) text-[10px]">
                  GA {ROOM_GA[selectedRoom].dim}
                </span>
              </label>
              <input
                id="floorplan-dimmer-control"
                type="range"
                min={5}
                max={100}
                value={rooms[selectedRoom].dimmer}
                onChange={(e) => updateRoom(selectedRoom, { dimmer: Number(e.target.value) })}
                className="w-full accent-(--color-primary)"
                aria-label={t('floorplan.dimmer')}
              />
            </div>
          )}

          {/* Temperature setpoint */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer size={16} className="text-orange-400" aria-hidden="true" />
              <span className="text-sm">
                {t('floorplan.setpoint')}: {rooms[selectedRoom].setpoint.toFixed(1)}°C
              </span>
              <span className="font-mono text-(--color-muted) text-[10px]">
                GA {ROOM_GA[selectedRoom].setpoint}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  updateRoom(selectedRoom, {
                    setpoint: Math.max(15, rooms[selectedRoom].setpoint - 0.5),
                  })
                }
                className="focus-ring flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:text-(--color-text) active:scale-[0.9]"
                aria-label={t('accessibility.tempDecreaseRoom', {
                  room: roomLabels[selectedRoom],
                  temp: (rooms[selectedRoom].setpoint - 0.5).toFixed(1),
                })}
              >
                <Moon size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() =>
                  updateRoom(selectedRoom, {
                    setpoint: Math.min(30, rooms[selectedRoom].setpoint + 0.5),
                  })
                }
                className="focus-ring flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:text-(--color-text) active:scale-[0.9]"
                aria-label={t('accessibility.tempIncreaseRoom', {
                  room: roomLabels[selectedRoom],
                  temp: (rooms[selectedRoom].setpoint + 0.5).toFixed(1),
                })}
              >
                <Sun size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}
