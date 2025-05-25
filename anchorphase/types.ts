
export interface Exercise {
  id: string;
  name: string;
}

export interface ExerciseSet {
  setNumber: number;
  weight: string; // Store as string to allow empty input
  reps: string;   // Store as string to allow empty input
  completed: boolean;
}

export interface LoggedExercise {
  exerciseId: string;
  name: string; // Store name for easier display
  sets: ExerciseSet[];
  notes?: string; // ADDED: Optional notes for the entire exercise on this logged day
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  exercises: LoggedExercise[];
}

export interface WeeklyTemplateExercise {
  exerciseId: string;
  targetSets: number;
  targetReps?: string; // Optional: suggested reps per set
  originalIndex?: number; // Added for preserving paste order
}

export interface WeeklyTemplateDay {
  dayOfWeek: number; // 0 for Sunday, 1 for Monday, etc.
  exercises: WeeklyTemplateExercise[];
}

// Group Feature Types
export interface Group {
  id: string;
  name: string;
  ownerId: string; // userId of the group creator
  inviteCode: string; // Human-readable code for sharing (primarily for identification)
  sharedTemplate: WeeklyTemplateDay[]; // The template shared by this group
  lastUpdated: string; // ISO date string of when the template was last updated
}

export interface AppData {
  userId: string; // Unique identifier for the user/browser instance
  exercises: Exercise[];
  weeklyTemplate: WeeklyTemplateDay[];
  dailyLogs: DailyLog[];
  groups: Group[]; // Groups the user is part of (owns or joined)
  activeSyncedGroupId?: string; // ID of the group template the user is currently synced to
}

export interface OneRepMaxDataPoint {
  date: string; // YYYY-MM-DD
  exerciseName: string;
  predicted1RM: number;
}

export enum View {
  Setup = 'SETUP',
  Log = 'LOG',
  Progress = 'PROGRESS',
  Calendar = 'CALENDAR',
  Groups = 'GROUPS', // Added Groups view
}

// For CSV parsing in ExerciseSetup
export interface ParsedCSVExercisePlanItem {
  name: string;
  targetSets: number;
  targetReps?: string;
  originalIndex?: number;
}

// For displaying exercise history in WeeklyLog
export interface ExerciseSetHistoryEntry {
  date: string;
  setNumber: number;
  weight: string;
  reps: string;
  completed: boolean;
}
