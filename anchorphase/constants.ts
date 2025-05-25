
export const APP_NAME = "AnchorPhase";
export const LOCAL_STORAGE_KEY = "anchorPhaseData"; // Also update local storage key to reflect new app name

// Epley 1RM Formula: weight * (1 + reps / 30)
export const calculateEpley1RM = (weight: number, reps: number): number => {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
};

export const DAYS_OF_WEEK = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

export const MAX_SETS_PER_EXERCISE = 10;
export const MAX_REPS_WEIGHT = 500; // Max reasonable weight/reps for input