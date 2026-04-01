export type ShiftCode = 'S11' | 'S12' | 'S13' | 'AL-S11' | 'AL-S12' | 'AL-S13' | 'S78' | 'X' | 'A' | 'H';

export interface NotificationPreferences {
  newRequests: boolean;
  requestStatus: boolean;
  warnings: boolean;
  lineEnabled: boolean;
}

export interface Member {
  id: string;
  uid: string;
  name: string;
  station: string;
  zone: string;
  lineToken?: string;
  quotaA: number;
  quotaH: number;
  maxHolidays?: number; // Added for holiday setting
  shiftPattern: string; // Comma separated codes
  cycleStartDate: string; // YYYY-MM-DD
  role: 'admin' | 'user';
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
  fromMemberId: string;
  toMemberId?: string;
  type: 'swap' | 'double' | 'dayoff';
  fromDate: string;
  toDate?: string;
  fromShiftCode: ShiftCode;
  toShiftCode?: ShiftCode;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
}
