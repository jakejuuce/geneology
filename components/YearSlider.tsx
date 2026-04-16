'use client';

import { useCallback, useRef } from 'react';

interface Props {
  year: number;
  min: number;
  max: number;
  onChange: (year: number) => void;
}

const CENTURY_MARKS = [1400, 1500, 1600, 1700, 1800, 1900, 2000];

export default function YearSlider({ year, min, max, onChange }: Props) {
  const railRef = useRef<HTMLDivElement>(null);

  const positionFromYear = (y: number) => ((y - min) / (max - min)) * 100;

  const handleDrag = useCallback(
    (clientX: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.round(min + pct * (max - min));
      onChange(y);
    },
    [min, max, onChange]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleDrag(e.clientX);
      const move = (ev: MouseEvent) => handleDrag(ev.clientX);
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [handleDrag]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      handleDrag(e.touches[0]!.clientX);
      const move = (ev: TouchEvent) => handleDrag(ev.touches[0]!.clientX);
      const end = () => {
        window.removeEventListener('touchmove', move);
        window.removeEventListener('touchend', end);
      };
      window.addEventListener('touchmove', move);
      window.addEventListener('touchend', end);
    },
    [handleDrag]
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onChange(Math.max(min, year - 1));
      if (e.key === 'ArrowRight') onChange(Math.min(max, year + 1));
      if (e.key === 'Home') onChange(min);
      if (e.key === 'End') onChange(max);
    },
    [year, min, max, onChange]
  );

  return (
    <div
      className="slider-track"
      ref={railRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className="slider-rule" />
      {CENTURY_MARKS.map((y) => (
        <div
          key={y}
          className="tick major"
          style={{ left: `${positionFromYear(y)}%` }}
        >
          <span className="tick-label">{y}</span>
        </div>
      ))}
      <div
        className="handle"
        style={{ left: `${positionFromYear(year)}%` }}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={year}
        onKeyDown={onKey}
      >
        <div className="handle-year">{year}</div>
      </div>
    </div>
  );
}
