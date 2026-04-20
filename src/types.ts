export type ShiftCode = 'S11' | 'S12' | 'S13' | 'AL-S11' | 'AL-S12' | 'AL-S13' | 'S78' | 'X' | 'A' | 'H';

export interface NotificationPreferences {
  newRequests: boolean;
  requestStatus: boolean;
  warnings: boolean;
}

export interface Member {
  id: string;
  uid: string;
  name: string;
  station: string;
  zone: string;
  position?: 'SS' | 'AStS' | 'SP';
  email?: string;
  quotaA: number;
  quotaH: number;
  quotaX: number;
  shiftPattern: string; // Comma separated codes
  cycleStartDate: string; // YYYY-MM-DD
  role: 'admin' | 'member';
  notificationPreferences?: NotificationPreferences;
}

export interface ShiftProperty {
  id: string; // ShiftCode
  name: string; // e.g., "ดิวช่วย"
  description?: string;
  color?: string;
}

export interface Shift {
  id: string; // memberId_date
  memberId: string;
  date: string; // YYYY-MM-DD
  shiftCode: ShiftCode;
  originalShiftCode?: ShiftCode;
  isDoubleShift?: boolean;
  updatedAt: string;
}

export interface SwapRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  targetId?: string;
  targetName?: string;
  type: 'swap' | 'cover';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requesterDate: string;
  targetDate?: string;
  requesterShift: string;
  targetShift?: string;
  reason?: string;
  isHolidaySwap?: boolean;
  returnDate?: string;
  createdAt: string;
}
