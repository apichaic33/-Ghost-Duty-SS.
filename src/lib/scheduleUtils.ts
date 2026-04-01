import { addDays, differenceInDays, format, parseISO } from 'date-fns';
import { ShiftCode, Member, Shift } from '../types';

/**
 * Gets the shift code for a member on a specific date, 
 * checking existing overrides first, then falling back to the pattern.
 */
export function getShiftCode(
  member: Member,
  dateStr: string,
  existingShifts: Shift[]
): ShiftCode {
  const existing = existingShifts.find(s => s.date === dateStr && s.memberId === member.id);
  if (existing) return existing.shiftCode;

  const pattern = member.shiftPattern.split(',').map(s => s.trim() as ShiftCode);
  const startDate = parseISO(member.cycleStartDate);
  const targetDate = parseISO(dateStr);
  
  const diff = differenceInDays(targetDate, startDate);
  if (diff < 0) return 'X'; // Before cycle start
  
  const patternIndex = diff % pattern.length;
  return pattern[patternIndex];
}

/**
 * Generates a shift schedule for a member for a given number of years.
 */
export function generateSchedule(
  memberId: string,
  patternStr: string,
  startDateStr: string,
  years: number = 2
): { date: string; shiftCode: ShiftCode }[] {
  const pattern = patternStr.split(',').map(s => s.trim() as ShiftCode);
  const startDate = parseISO(startDateStr);
  const endDate = addDays(startDate, years * 365 + 1); // Approx 2 years
  
  const schedule: { date: string; shiftCode: ShiftCode }[] = [];
  let currentDate = startDate;

  // We might need to generate from a fixed reference point or just from the startDate
  // If the user wants to see the schedule for the next 2 years from "now", 
  // we still need the cycleStartDate to know where they are in the cycle.
  
  const totalDays = differenceInDays(endDate, startDate);
  
  for (let i = 0; i <= totalDays; i++) {
    const date = addDays(startDate, i);
    const patternIndex = i % pattern.length;
    schedule.push({
      date: format(date, 'yyyy-MM-dd'),
      shiftCode: pattern[patternIndex]
    });
  }

  return schedule;
}

/**
 * Validates shift rules:
 * 1. Max 8 consecutive working days.
 * 2. No S13 (Night) followed by S11 (Morning) - Warning only.
 */
export function validateShifts(shifts: { date: string; shiftCode: ShiftCode }[]): string[] {
  const warnings: string[] = [];
  let consecutiveWorkDays = 0;

  for (let i = 0; i < shifts.length; i++) {
    const current = shifts[i];
    const isWork = current.shiftCode !== 'X' && current.shiftCode !== 'A' && current.shiftCode !== 'H';

    if (isWork) {
      consecutiveWorkDays++;
    } else {
      consecutiveWorkDays = 0;
    }

    if (consecutiveWorkDays > 8) {
      const startOfSequence = shifts[i - consecutiveWorkDays + 1].date;
      warnings.push(`ทำงานติดต่อกันเกิน 8 วัน เริ่มตั้งแต่วันที่ ${startOfSequence}`);
    }

    // Check S13 -> S11
    if (i > 0) {
      const prev = shifts[i - 1];
      if (prev.shiftCode === 'S13' && current.shiftCode === 'S11') {
        warnings.push(`กะดึก (S13) ต่อด้วยกะเช้า (S11) ในวันที่ ${current.date} (ไม่แนะนำ)`);
      }
    }
  }

  return Array.from(new Set(warnings));
}
