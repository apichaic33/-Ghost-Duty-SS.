import { useState, useEffect, CSSProperties } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ShiftProperty } from '../types';

const FALLBACK_COLORS: Record<string, string> = {
  'S11': '#ea580c', 'S12': '#ea580c', 'S13': '#ea580c', 'S78': '#ea580c',
  'AL-S11': '#d97706', 'AL-S12': '#d97706', 'AL-S13': '#d97706',
  'X': '#9ca3af', 'A': '#ef4444', 'H': '#f43f5e',
};

export function useShiftProperties() {
  const [shiftProps, setShiftProps] = useState<ShiftProperty[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shiftProperties'), snap => {
      setShiftProps(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftProperty)));
    });
    return unsub;
  }, []);

  const colorMap: Record<string, string> = {
    ...FALLBACK_COLORS,
    ...Object.fromEntries(shiftProps.filter(p => p.color).map(p => [p.id, p.color])),
  };

  const getColor = (code: string): string => colorMap[code] || '#9ca3af';

  // Returns inline style: light bg + colored text + soft border
  const getShiftStyle = (code: string): React.CSSProperties => {
    const c = getColor(code);
    return { backgroundColor: c + '14', color: c, borderColor: c + '33' };
  };

  // Muted gray style for "other members" in TeamSchedule
  const getOtherShiftStyle = (code: string): React.CSSProperties => {
    if (code === 'X') return { backgroundColor: 'white', color: '#d1d5db', borderColor: '#f3f4f6' };
    if (code === 'A') return { backgroundColor: '#fef2f2', color: '#f87171' };
    if (code === 'H') return { backgroundColor: '#fff1f2', color: '#fb7185' };
    return { backgroundColor: '#f3f4f6', color: '#9ca3af' };
  };

  return { shiftProps, getColor, getShiftStyle, getOtherShiftStyle };
}
