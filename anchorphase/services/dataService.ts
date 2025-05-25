
import { AppData, Exercise, WeeklyTemplateDay, DailyLog, OneRepMaxDataPoint, ExerciseSet, ParsedCSVExercisePlanItem, ExerciseSetHistoryEntry, WeeklyTemplateExercise, Group } from '../types';
import { LOCAL_STORAGE_KEY, calculateEpley1RM, DAYS_OF_WEEK } from '../constants';

// Helper: Generate a simple unique ID
export const generateUniqueId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
};

// Helper: Generate a human-readable invite code (example)
export const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};


// Date Utilities
export const getWeekStartDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 for Sunday, 1 for Monday, ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const formatDateISO = (date: Date): string => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

export const formatDateFriendly = (date: Date): string => {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const getWeekDays = (startDate: Date): Date[] => {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(startDate, i));
  }
  return days;
};


// Data Service
export const loadData = (): AppData => {
  const dataStr = localStorage.getItem(LOCAL_STORAGE_KEY);
  let baseData: Partial<AppData> = {};
  if (dataStr) {
    baseData = JSON.parse(dataStr) as AppData;
  }

  // Ensure weeklyTemplate has all 7 days
  if (!baseData.weeklyTemplate || baseData.weeklyTemplate.length !== 7) {
    baseData.weeklyTemplate = Array(7).fill(null).map((_, i) => ({ dayOfWeek: i, exercises: [] }));
  } else {
    baseData.weeklyTemplate = baseData.weeklyTemplate.map((day, i) => ({
      dayOfWeek: day?.dayOfWeek ?? i,
      exercises: day?.exercises ?? [],
    }));
  }

  // Sort exercises alphabetically
  if (baseData.exercises) {
    baseData.exercises.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    userId: baseData.userId || generateUniqueId(),
    exercises: baseData.exercises || [],
    weeklyTemplate: baseData.weeklyTemplate,
    dailyLogs: baseData.dailyLogs || [],
    groups: baseData.groups || [],
    activeSyncedGroupId: baseData.activeSyncedGroupId || undefined,
  };
};

export const saveData = (data: AppData): void => {
  if (data.exercises) {
    data.exercises.sort((a, b) => a.name.localeCompare(b.name));
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
};

export const getExercises = (data: AppData): Exercise[] => data.exercises;

export const addExercise = (data: AppData, name: string): { newData: AppData; newExercise: Exercise | null } => {
  const trimmedName = name.trim();
  if (!trimmedName) {
      return { newData: data, newExercise: null };
  }
  const existingExercise = data.exercises.find(ex => ex.name.toLowerCase() === trimmedName.toLowerCase());
  if (existingExercise) {
    return { newData: data, newExercise: existingExercise };
  }
  const newExercise: Exercise = { id: generateUniqueId(), name: trimmedName };
  const updatedExercises = [...data.exercises, newExercise].sort((a,b) => a.name.localeCompare(b.name));
  return { newData: { ...data, exercises: updatedExercises }, newExercise };
};


export const updateWeeklyTemplate = (data: AppData, newTemplate: WeeklyTemplateDay[]): AppData => {
  return { ...data, weeklyTemplate: newTemplate, activeSyncedGroupId: undefined }; // Editing template desyncs
};

// Function to desync if template is directly modified
export const desyncActiveGroup = (data: AppData): AppData => {
    if (data.activeSyncedGroupId) {
        return { ...data, activeSyncedGroupId: undefined };
    }
    return data;
};


export const getDailyLog = (data: AppData, date: string): DailyLog | undefined => {
  return data.dailyLogs.find(log => log.date === date);
};

export const upsertDailyLog = (data: AppData, log: DailyLog): AppData => {
  const existingLogIndex = data.dailyLogs.findIndex(dlog => dlog.date === log.date);
  let newLogs = [...data.dailyLogs];
  if (existingLogIndex > -1) {
    newLogs[existingLogIndex] = log;
  } else {
    newLogs.push(log);
  }
  return { ...data, dailyLogs: newLogs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()) };
};

export const calculate1RMData = (data: AppData): OneRepMaxDataPoint[] => {
  const oneRMData: OneRepMaxDataPoint[] = [];
  data.dailyLogs.forEach(log => {
    log.exercises.forEach(loggedEx => {
      let max1RMForDay = 0;
      loggedEx.sets.forEach(set => {
        const weight = parseFloat(set.weight);
        const repsString = set.reps.trim();
        if (/^\d+$/.test(repsString)) { 
          const reps = parseInt(repsString, 10);
          if (weight > 0 && reps > 0) {
            const current1RM = calculateEpley1RM(weight, reps);
            if (current1RM > max1RMForDay) {
              max1RMForDay = current1RM;
            }
          }
        }
      });
      if (max1RMForDay > 0) {
        oneRMData.push({
          date: log.date,
          exerciseName: loggedEx.name,
          predicted1RM: parseFloat(max1RMForDay.toFixed(2)),
        });
      }
    });
  });
  return oneRMData.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const parseCSVExercisePlan = (csvText: string): ParsedCSVExercisePlanItem[] => {
  if (!csvText.trim()) return [];
  const items: ParsedCSVExercisePlanItem[] = [];
  const rows = csvText.split('\n').map(row => row.trim()).filter(row => row.length > 0);

  rows.forEach((row, index) => { 
    const columns = row.split(',').map(col => col.trim());
    if (columns.length >= 2) {
      const name = columns[0];
      const targetSets = parseInt(columns[1], 10);
      const targetReps = columns.length >= 3 ? columns[2] : undefined; 

      if (name && !isNaN(targetSets) && targetSets > 0) {
        items.push({ name, targetSets, targetReps: targetReps && targetReps.length > 0 ? targetReps : undefined });
      }
    }
  });
  return items;
};

export const getExerciseSetHistory = (appData: AppData, exerciseId: string): ExerciseSetHistoryEntry[] => {
  const history: ExerciseSetHistoryEntry[] = [];
  const sortedLogs = [...appData.dailyLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  sortedLogs.forEach(log => {
    const loggedExercise = log.exercises.find(ex => ex.exerciseId === exerciseId);
    if (loggedExercise) {
      loggedExercise.sets.forEach(set => {
        if (set.completed || (set.weight.trim() !== '' && set.reps.trim() !== '')) {
          history.push({
            date: log.date,
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
            completed: set.completed,
          });
        }
      });
    }
  });
  return history.sort((a,b) => {
    const dateComparison = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateComparison !== 0) return dateComparison;
    return a.setNumber - b.setNumber;
  });
};

const extractWorkoutFromTextBlock = (textBlock: string): Omit<ParsedCSVExercisePlanItem, 'originalIndex'> | null => {
  const blockContent = textBlock.trim();
  if (!blockContent) return null;

  const parts = blockContent.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 2) return null; 

  const movementParts: string[] = [];
  let setsStr: string | null = null;
  let repsStr: string | null = null;
  let setsIndex = -1;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^\d+$/.test(part)) { 
      if (setsStr === null) { 
        setsStr = part;
        setsIndex = i;
        if (i + 1 < parts.length) {
          let potentialReps = parts[i+1];
          if (/^\d+(s|ea|S|EA)?$/.test(potentialReps) || /^\d+$/.test(potentialReps)) {
             repsStr = potentialReps;
             if ( (potentialReps.match(/^\d+$/) || potentialReps.toLowerCase().endsWith('s') ) && 
                  i + 2 < parts.length && parts[i+2].toLowerCase() === 'ea' && potentialReps.toLowerCase().endsWith('s')) {
                 repsStr += ` ${parts[i+2]}`;
             } else if (potentialReps.match(/^\d+$/) && i + 2 < parts.length && (parts[i+2].toLowerCase() === 's' || parts[i+2].toLowerCase() === 'ea')) {
                 repsStr += ` ${parts[i+2]}`;
                 if (parts[i+2].toLowerCase() === 's' && i + 3 < parts.length && parts[i+3].toLowerCase() === 'ea') {
                    repsStr += ` ${parts[i+3]}`;
                 }
             }
          }
        }
        break; 
      }
    }
    movementParts.push(part);
  }

  const name = movementParts.join(" ").trim();
  if (!name || !setsStr) return null;

  const sets = parseInt(setsStr, 10);
  if (isNaN(sets) || sets <= 0 || sets >= 100) return null;
  
  const validRepPattern = /^(?:\d+(?:\s*(?:s|S|ea|EA|s\s*ea|S\s*EA))?)$/;
  if (repsStr !== null && !validRepPattern.test(repsStr.trim())) {
    if (!/^\d+$/.test(repsStr.trim())) { 
        repsStr = null; 
    }
  }

  if (repsStr === null && setsIndex + 1 < parts.length && /^\d+$/.test(parts[setsIndex+1])) {
      repsStr = parts[setsIndex+1];
  }

  return { name, targetSets: sets, targetReps: repsStr ? repsStr.trim() : undefined };
};

export const parseFullWorkoutPlanFromText = (rawText: string): { [dayOfWeek: number]: ParsedCSVExercisePlanItem[] } => {
  const lines = rawText.trim().split('\n').map(line => line.trimEnd());
  const result: { [dayOfWeek: number]: ParsedCSVExercisePlanItem[] } = {};

  let detectedDayOfWeek: number | null = null;
  let lineIndexOfDayName = -1;

  for (let i = 0; i < Math.min(lines.length, 5); i++) { 
    const lineContent = lines[i].trim();
    const dayIndex = DAYS_OF_WEEK.findIndex(day => day.toLowerCase() === lineContent.toLowerCase());
    if (dayIndex !== -1) {
      const parts = lineContent.split(/\s+/);
      if (parts.length === 1 && parts[0].toLowerCase() === DAYS_OF_WEEK[dayIndex].toLowerCase()) {
          detectedDayOfWeek = dayIndex;
          lineIndexOfDayName = i;
          break;
      }
    }
  }

  let headerLineIndex = -1;
  let headerLineContent: string | undefined = undefined;
  const searchStartForHeader = (lineIndexOfDayName !== -1) ? lineIndexOfDayName + 1 : 0;

  for (let i = searchStartForHeader; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    if (lineLower.includes("movement") && lineLower.includes("sets") && lineLower.includes("reps")) {
      headerLineContent = lines[i]; 
      headerLineIndex = i;
      break;
    }
  }

  if (!headerLineContent || headerLineIndex === -1) {
    for (let i = searchStartForHeader; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (lineLower.includes("movement") && lineLower.includes("sets")) {
          headerLineContent = lines[i]; 
          headerLineIndex = i;
          break;
        }
      }
      if (!headerLineContent || headerLineIndex === -1) {
        return {};
      }
  }

  const dataLinesStartAtIndex = headerLineIndex + 1;

  if (detectedDayOfWeek !== null) {
    result[detectedDayOfWeek] = []; 
    let exerciseCounterForDay = 0;
    for (let lineIdx = dataLinesStartAtIndex; lineIdx < lines.length; lineIdx++) {
      const currentLine = lines[lineIdx];
      if (!currentLine.trim()) continue; 

      const parsedItemBase = extractWorkoutFromTextBlock(currentLine);
      if (parsedItemBase) {
        const parsedItem: ParsedCSVExercisePlanItem = {
            ...parsedItemBase,
            originalIndex: exerciseCounterForDay++
        };
        result[detectedDayOfWeek].push(parsedItem);
      }
    }
  } 
  else {
    const colStartIndicator = "movement";
    const colStarts: number[] = [];
    let currentPos = -1;
    while ((currentPos = headerLineContent.toLowerCase().indexOf(colStartIndicator, currentPos + 1)) !== -1) {
      colStarts.push(currentPos);
    }
    
    if (colStarts.length === 0) return {};

    const dayOrderForColumns = [1, 2, 4, 5]; 
    const columnDefinitions: { dayOfWeek: number; start: number; end: number }[] = [];

    for (let i = 0; i < colStarts.length; i++) {
      if (i >= dayOrderForColumns.length) break; 
      
      const dayOfWeek = dayOrderForColumns[i];
      const start = colStarts[i];
      const end = (i + 1 < colStarts.length) ? colStarts[i+1] -1 : headerLineContent.length;
      columnDefinitions.push({ dayOfWeek, start, end });
    }
    
    const tempExercisesByDay: { [dayKey: number]: ParsedCSVExercisePlanItem[] } = {};
    DAYS_OF_WEEK.forEach((_, idx) => tempExercisesByDay[idx] = []);

    for (let lineIdx = dataLinesStartAtIndex; lineIdx < lines.length; lineIdx++) {
      const currentLine = lines[lineIdx];
      if (!currentLine.trim()) continue; 

      columnDefinitions.forEach(colDef => {
        const { dayOfWeek, start, end } = colDef;
        const blockStart = Math.min(start, currentLine.length);
        const blockEnd = Math.min(end + 1, currentLine.length); 
        
        const textBlock = currentLine.substring(blockStart, blockEnd);
        const parsedItemBase = extractWorkoutFromTextBlock(textBlock);

        if (parsedItemBase) {
           const parsedItem: ParsedCSVExercisePlanItem = {
               ...parsedItemBase,
               originalIndex: tempExercisesByDay[dayOfWeek].length
           }
          tempExercisesByDay[dayOfWeek].push(parsedItem);
        }
      });
    }
    for (const dayKey in tempExercisesByDay) {
        if (tempExercisesByDay[dayKey].length > 0) {
            result[dayKey] = tempExercisesByDay[dayKey];
        }
    }
  }
  return result;
};

// --- Group Management Functions ---

export const createGroup = (appData: AppData, groupName: string): AppData => {
  const trimmedName = groupName.trim();
  if (!trimmedName) return appData;

  const newGroup: Group = {
    id: generateUniqueId(),
    name: trimmedName,
    ownerId: appData.userId,
    inviteCode: generateInviteCode(),
    sharedTemplate: JSON.parse(JSON.stringify(appData.weeklyTemplate)), // Deep copy current template
    lastUpdated: new Date().toISOString(),
  };
  return { ...appData, groups: [...appData.groups, newGroup] };
};

export const updateGroupSharedTemplate = (appData: AppData, groupId: string): AppData => {
  const groupIndex = appData.groups.findIndex(g => g.id === groupId && g.ownerId === appData.userId);
  if (groupIndex === -1) return appData; // Group not found or not owner

  const updatedGroups = [...appData.groups];
  updatedGroups[groupIndex] = {
    ...updatedGroups[groupIndex],
    sharedTemplate: JSON.parse(JSON.stringify(appData.weeklyTemplate)), // Deep copy
    lastUpdated: new Date().toISOString(),
  };
  return { ...appData, groups: updatedGroups };
};

export const applyGroupTemplateToUser = (appData: AppData, groupId: string): AppData => {
  const group = appData.groups.find(g => g.id === groupId);
  if (!group) return appData; // Group not found

  return {
    ...appData,
    weeklyTemplate: JSON.parse(JSON.stringify(group.sharedTemplate)), // Deep copy
    activeSyncedGroupId: group.id,
  };
};

export const addGroupFromImport = (appData: AppData, groupJSON: string): { newData: AppData, error?: string, importedGroup?: Group } => {
  try {
    const importedGroup = JSON.parse(groupJSON) as Group;
    // Basic validation
    if (!importedGroup.id || !importedGroup.name || !importedGroup.ownerId || !importedGroup.inviteCode || !importedGroup.sharedTemplate || !importedGroup.lastUpdated) {
      return { newData: appData, error: "Invalid group data format." };
    }
    if (appData.groups.some(g => g.id === importedGroup.id)) {
      // Group already exists, maybe update it if it's an update from owner?
      // For now, simple: if ID exists, don't re-add if user is not owner.
      // If user is owner, this path shouldn't ideally be taken; they'd update.
      // If non-owner imports an update, we could update their local copy of the group.
      const existingGroupIndex = appData.groups.findIndex(g => g.id === importedGroup.id);
      if (existingGroupIndex !== -1) {
          const updatedGroups = [...appData.groups];
          // Only update if the imported one is newer and user is not the owner
          if (new Date(importedGroup.lastUpdated) > new Date(updatedGroups[existingGroupIndex].lastUpdated) && updatedGroups[existingGroupIndex].ownerId !== appData.userId) {
            updatedGroups[existingGroupIndex] = importedGroup;
             return { newData: { ...appData, groups: updatedGroups }, importedGroup };
          }
          return { newData: appData, error: "Group already exists or local version is newer.", importedGroup: updatedGroups[existingGroupIndex] };
      }
    }
    
    return { newData: { ...appData, groups: [...appData.groups, importedGroup] }, importedGroup };
  } catch (e) {
    return { newData: appData, error: "Failed to parse group data. Ensure it's valid JSON." };
  }
};

export const removeGroup = (appData: AppData, groupId: string): AppData => {
  const newGroups = appData.groups.filter(g => g.id !== groupId);
  let newActiveSyncedGroupId = appData.activeSyncedGroupId;
  if (appData.activeSyncedGroupId === groupId) {
    newActiveSyncedGroupId = undefined; // Desync if leaving the currently synced group
  }
  return { ...appData, groups: newGroups, activeSyncedGroupId: newActiveSyncedGroupId };
};
