
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppData, DailyLog, LoggedExercise, ExerciseSet, WeeklyTemplateExercise, ExerciseSetHistoryEntry, Exercise } from '../types';
import { getWeekStartDate, addDays, formatDateISO, formatDateFriendly, getWeekDays, upsertDailyLog, getDailyLog, getExerciseSetHistory } from '../services/dataService';
import { DAYS_OF_WEEK, MAX_SETS_PER_EXERCISE } from '../constants';

// Debounce utility function
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    return ((...args: Parameters<T>) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
        }, delay);
    }) as T;
}

const AUTOSAVE_DELAY = 2000; // 2 seconds

interface WeeklyLogProps {
  data: AppData;
  onDataChange: (newData: AppData) => void;
}

const HistoryModal: React.FC<{
  exerciseName: string;
  history: ExerciseSetHistoryEntry[];
  onClose: () => void;
}> = ({ exerciseName, history, onClose }) => {
  if (!history) return null;

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" 
        onClick={onClose} 
        role="dialog" 
        aria-modal="true"
        aria-labelledby="historyModalTitle"
    >
      <div 
        className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" 
        onClick={e => e.stopPropagation()} // Prevent click inside from closing
      >
        <div className="flex justify-between items-center mb-4">
          <h3 id="historyModalTitle" className="text-xl font-semibold text-blue-700">History for: {exerciseName}</h3>
          <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-slate-700 text-2xl"
            aria-label="Close history modal"
          >&times;</button>
        </div>
        {history.length === 0 ? (
          <p className="text-slate-500">No previous sets logged for this exercise.</p>
        ) : (
          <div className="space-y-2">
            {history.map((entry, index) => (
              <div key={index} className="p-2 border border-slate-200 rounded bg-slate-50 text-sm">
                <p><strong className="text-slate-600">Date:</strong> {formatDateFriendly(new Date(entry.date + 'T00:00:00'))}</p>
                <p><strong className="text-slate-600">Set {entry.setNumber}:</strong> {entry.weight} kg/lb x {entry.reps} reps {entry.completed ? <span className="text-green-600 font-semibold">(Done)</span> : <span className="text-orange-500">(Not Done)</span>}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const WeeklyLog: React.FC<WeeklyLogProps> = ({ data, onDataChange }) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStartDate(new Date()));
  const [logsForWeek, setLogsForWeek] = useState<DailyLog[]>([]);
  const [historyModalContent, setHistoryModalContent] = useState<{ exerciseName: string; history: ExerciseSetHistoryEntry[] } | null>(null);
  const [editingExerciseName, setEditingExerciseName] = useState<{logIdx: number, exIdx: number, name: string} | null>(null);
  
  const [unsavedChangesDates, setUnsavedChangesDates] = useState<Set<string>>(new Set());

  // Refs for stable callbacks and values in debounced functions
  const dataRef = useRef(data);
  const onDataChangeRef = useRef(onDataChange);
  const logsForWeekRef = useRef(logsForWeek);
  const unsavedChangesDatesRef = useRef(unsavedChangesDates);
  const isMountedRef = useRef(false);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);
  useEffect(() => { logsForWeekRef.current = logsForWeek; }, [logsForWeek]);
  useEffect(() => { unsavedChangesDatesRef.current = unsavedChangesDates; }, [unsavedChangesDates]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Potential: Cancel any ongoing debounced calls if the debounce function provides a cancel method
    };
  }, []);

  const getExerciseNameById = useCallback((id: string): string => {
    return dataRef.current.exercises.find(ex => ex.id === id)?.name || 'Unknown Exercise';
  }, []); // dataRef.current.exercises won't make this re-memoize unnecessarily if data obj itself changes
  
  const initializeSetsForExercise = useCallback((exerciseId: string, dayOfWeek: number): ExerciseSet[] => {
    const templateDay = dataRef.current.weeklyTemplate.find(td => td.dayOfWeek === dayOfWeek);
    const templateEx = templateDay?.exercises.find(te => te.exerciseId === exerciseId);

    const numSets = templateEx?.targetSets || 1; 
    return Array.from({ length: numSets }, (_, i) => ({
      setNumber: i + 1,
      weight: '',
      reps: templateEx?.targetReps || '',
      completed: false,
    }));
  }, []);

  const initializeLogsForDay = useCallback((date: Date): DailyLog => {
    const isoDate = formatDateISO(date);
    const existingLog = getDailyLog(dataRef.current, isoDate);
    if (existingLog) return JSON.parse(JSON.stringify(existingLog)); 

    const dayOfWeek = date.getDay();
    const templateDay = dataRef.current.weeklyTemplate.find(td => td.dayOfWeek === dayOfWeek);
    
    const exercises: LoggedExercise[] = templateDay ? templateDay.exercises.map(templateEx => ({
      exerciseId: templateEx.exerciseId,
      name: getExerciseNameById(templateEx.exerciseId),
      sets: initializeSetsForExercise(templateEx.exerciseId, dayOfWeek),
      notes: '', 
    })) : [];
    
    return { date: isoDate, exercises };
  }, [getExerciseNameById, initializeSetsForExercise]);

  useEffect(() => {
    const weekDates = getWeekDays(currentWeekStart);
    const newLogsForWeek = weekDates.map(date => initializeLogsForDay(date));
    setLogsForWeek(newLogsForWeek);
  }, [currentWeekStart, data.weeklyTemplate, data.dailyLogs, initializeLogsForDay]); // Keep data deps for re-init if template/logs change globally


  const performAutoSave = useCallback(async () => {
    if (!isMountedRef.current || unsavedChangesDatesRef.current.size === 0) {
        return;
    }

    let tempAppData = { ...dataRef.current }; 
    const datesToSave = Array.from(unsavedChangesDatesRef.current);
    let anyChangeMadeToAppData = false;

    for (const date of datesToSave) {
        const logForDate = logsForWeekRef.current.find(log => log.date === date);
        if (logForDate) {
            const cleanedExercises = logForDate.exercises.map(ex => ({
                ...ex,
                sets: ex.sets.filter(set => set.completed || (set.weight.trim() !== '' && set.reps.trim() !== ''))
            }));
            const cleanedLogToSave = { ...logForDate, exercises: cleanedExercises };
            
            const existingLogInAppData = tempAppData.dailyLogs.find(dlog => dlog.date === date);
            if (JSON.stringify(existingLogInAppData) !== JSON.stringify(cleanedLogToSave)) { // Avoid saving if no actual change to stored data
                 tempAppData = upsertDailyLog(tempAppData, cleanedLogToSave);
                 anyChangeMadeToAppData = true;
            }
        }
    }

    if (anyChangeMadeToAppData && isMountedRef.current) {
        onDataChangeRef.current(tempAppData);
    }

    if (isMountedRef.current) {
        setUnsavedChangesDates(prev => {
            const newSet = new Set(prev);
            datesToSave.forEach(date => newSet.delete(date));
            return newSet;
        });
    }
  }, []); // Stable due to refs

  const debouncedPerformAutoSave = useCallback(debounce(performAutoSave, AUTOSAVE_DELAY), [performAutoSave]);

  useEffect(() => {
    if (unsavedChangesDates.size > 0) {
        debouncedPerformAutoSave();
    }
  }, [unsavedChangesDates, debouncedPerformAutoSave]);


  const handleSetChange = (dailyLogIndex: number, exerciseIndex: number, setIndex: number, field: keyof Omit<ExerciseSet, 'notes'>, value: string | boolean) => {
    const newLogs = [...logsForWeek];
    const targetSet = newLogs[dailyLogIndex].exercises[exerciseIndex].sets[setIndex];

    if (typeof value === 'string') {
        if (field === 'weight' && (value !== '' && !/^\d*\.?\d*$/.test(value) || parseFloat(value) < 0)) {
            return; 
        }
        if (field === 'reps' && value !== '') {
            const repPattern = /^(?:\d+(?:\s*(?:s|S|ea|EA|s\s*ea|S\s*EA))?)$/;
            if (!repPattern.test(value.trim())) {
                return;
            }
        }
    }
    (targetSet as any)[field] = value;
    setLogsForWeek(newLogs);
    setUnsavedChangesDates(prev => new Set(prev).add(newLogs[dailyLogIndex].date));
  };

  const handleExerciseNoteChange = (dailyLogIndex: number, exerciseIndex: number, notes: string) => {
    const newLogs = [...logsForWeek];
    newLogs[dailyLogIndex].exercises[exerciseIndex].notes = notes;
    setLogsForWeek(newLogs);
    setUnsavedChangesDates(prev => new Set(prev).add(newLogs[dailyLogIndex].date));
  };
  
  const addSet = (dailyLogIndex: number, exerciseIndex: number) => {
    const newLogs = [...logsForWeek];
    const currentExercise = newLogs[dailyLogIndex].exercises[exerciseIndex];
    const currentSets = currentExercise.sets;

    const dayOfWeek = new Date(newLogs[dailyLogIndex].date + 'T00:00:00').getDay();
    const templateDay = dataRef.current.weeklyTemplate.find(td => td.dayOfWeek === dayOfWeek);
    const templateExercise = templateDay?.exercises.find(te => te.exerciseId === currentExercise.exerciseId);

    if (currentSets.length < MAX_SETS_PER_EXERCISE) {
      currentSets.push({
        setNumber: currentSets.length + 1,
        weight: '',
        reps: templateExercise?.targetReps || '', 
        completed: false,
      });
      setLogsForWeek(newLogs);
      setUnsavedChangesDates(prev => new Set(prev).add(newLogs[dailyLogIndex].date));
    }
  };

  const removeSet = (dailyLogIndex: number, exerciseIndex: number, setIndex: number) => {
    const newLogs = [...logsForWeek];
    newLogs[dailyLogIndex].exercises[exerciseIndex].sets.splice(setIndex, 1);
    newLogs[dailyLogIndex].exercises[exerciseIndex].sets.forEach((set, i) => set.setNumber = i + 1);
    setLogsForWeek(newLogs);
    setUnsavedChangesDates(prev => new Set(prev).add(newLogs[dailyLogIndex].date));
  };

  const saveDayLog = (dailyLogIndex: number) => {
    const logToSave = logsForWeek[dailyLogIndex];
    const cleanedExercises = logToSave.exercises.map(ex => ({
        ...ex, 
        sets: ex.sets.filter(set => set.completed || (set.weight.trim() !== '' && set.reps.trim() !== ''))
    }));
    const cleanedLogToSave = {...logToSave, exercises: cleanedExercises};

    const newData = upsertDailyLog(data, cleanedLogToSave); // Use original data prop here for consistency before onDataChange
    onDataChange(newData); // This updates dataRef via its useEffect

    alert(`Log for ${formatDateFriendly(new Date(logToSave.date + 'T00:00:00'))} saved!`);

    setUnsavedChangesDates(prev => {
        const newSet = new Set(prev);
        newSet.delete(logToSave.date);
        return newSet;
    });
    // If debouncedPerformAutoSave had a .cancel(), it could be called here.
  };

  const changeWeek = (offset: number) => {
    // Before changing week, ensure any pending autosaves are processed or cancelled if needed.
    // For simplicity, current autosave only saves, doesn't block navigation.
    // If unsavedChangesDatesRef.current.size > 0, user might lose data if they navigate too fast.
    // A more robust solution would involve confirming navigation or awaiting autosave.
    // However, for now, the autosave is quick.
    if (unsavedChangesDatesRef.current.size > 0) {
        performAutoSave(); // Attempt to save immediately before navigating weeks
    }
    setCurrentWeekStart(prev => addDays(prev, offset * 7));
  };
  
  const handleViewHistory = (exerciseId: string, exerciseName: string) => {
    const history = getExerciseSetHistory(dataRef.current, exerciseId);
    setHistoryModalContent({ exerciseName, history });
  };

  const processExerciseNameChange = (dailyLogIndex: number, exerciseIndexInLog: number, newExerciseName: string) => {
    const trimmedName = newExerciseName.trim();
    const newLogs = [...logsForWeek];
    const dayLog = newLogs[dailyLogIndex];
    const currentLoggedExercise = dayLog.exercises[exerciseIndexInLog];

    if (currentLoggedExercise.name.toLowerCase() === trimmedName.toLowerCase()) {
        setEditingExerciseName(null);
        return;
    }

    const newExerciseMaster = dataRef.current.exercises.find(ex => ex.name.toLowerCase() === trimmedName.toLowerCase());

    if (!newExerciseMaster) {
        alert(`Exercise "${trimmedName}" not found in your master list. Please add it first or check spelling.`);
        const inputElement = document.getElementById(`change-ex-name-${dailyLogIndex}-${exerciseIndexInLog}`) as HTMLInputElement;
        if (inputElement) inputElement.value = currentLoggedExercise.name; 
        setEditingExerciseName(null);
        return;
    }
    
    const dayOfWeek = new Date(dayLog.date + 'T00:00:00').getDay();
    
    dayLog.exercises[exerciseIndexInLog] = {
        exerciseId: newExerciseMaster.id,
        name: newExerciseMaster.name,
        sets: initializeSetsForExercise(newExerciseMaster.id, dayOfWeek),
        notes: '', 
    };
    setLogsForWeek(newLogs);
    setUnsavedChangesDates(prev => new Set(prev).add(dayLog.date));
    setEditingExerciseName(null);
  };


  const isCurrentWeek = (date: Date) => getWeekStartDate(new Date()).getTime() === getWeekStartDate(date).getTime();

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg space-y-6">
      {historyModalContent && (
        <HistoryModal 
          exerciseName={historyModalContent.exerciseName} 
          history={historyModalContent.history}
          onClose={() => setHistoryModalContent(null)}
        />
      )}
      <div className="flex justify-between items-center border-b pb-2">
        <h2 className="text-2xl font-semibold text-blue-700">Log Training</h2>
        <div className="flex items-center space-x-2">
          <button onClick={() => changeWeek(-1)} className="px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300">{"< Prev"}</button>
          <span className="text-lg font-medium text-slate-600 text-center" aria-live="polite">
            {formatDateFriendly(currentWeekStart)} - {formatDateFriendly(addDays(currentWeekStart, 6))}
          </span>
          <button onClick={() => changeWeek(1)} className="px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300">{"Next >"}</button>
        </div>
      </div>

      <div className="space-y-8">
        {logsForWeek.map((dailyLog, dailyLogIndex) => {
          const dayDate = new Date(dailyLog.date + 'T00:00:00'); 
          const dayOfWeek = dayDate.getDay();
          const isTodayOrPast = dayDate <= new Date() || isCurrentWeek(dayDate); // Simplified: allow editing for whole current week
          const templateForDay = dataRef.current.weeklyTemplate.find(d => d.dayOfWeek === dayOfWeek);
          const hasPlannedExercises = templateForDay && templateForDay.exercises.length > 0;

          if (!hasPlannedExercises && dailyLog.exercises.length === 0) {
             return (
              <div key={dailyLog.date} className="p-4 border border-slate-200 rounded-md bg-slate-50">
                <h3 className="text-xl font-medium text-blue-700 mb-1">{DAYS_OF_WEEK[dayOfWeek]} <span className="text-sm text-slate-500">({formatDateFriendly(dayDate)})</span></h3>
                <p className="text-slate-500 text-sm">Rest day or no exercises scheduled in template.</p>
              </div>
            );
          }

          return (
            <div key={dailyLog.date} className="p-4 border border-slate-200 rounded-md bg-slate-50" role="region" aria-labelledby={`dayHdr-${dailyLog.date}`}>
              <div className="flex justify-between items-center mb-3">
                <h3 id={`dayHdr-${dailyLog.date}`} className="text-xl font-medium text-blue-700">{DAYS_OF_WEEK[dayOfWeek]} <span className="text-sm text-slate-500">({formatDateFriendly(dayDate)})</span></h3>
                {isTodayOrPast && (
                   <button 
                    onClick={() => saveDayLog(dailyLogIndex)}
                    className="px-4 py-1.5 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
                  >
                    Save Day
                  </button>
                )}
              </div>

              {dailyLog.exercises.length === 0 && <p className="text-slate-500 text-sm">No exercises logged or planned for this day.</p>}
              
              {dailyLog.exercises.map((exercise, exerciseIndex) => (
                <div key={exercise.exerciseId + '-' + exerciseIndex + '-' + dailyLog.date} className="mb-6 p-3 bg-white rounded shadow">
                  <div className="flex justify-between items-center mb-2">
                     <input
                        id={`change-ex-name-${dailyLogIndex}-${exerciseIndex}`}
                        type="text"
                        defaultValue={exercise.name}
                        onFocus={(e) => setEditingExerciseName({logIdx: dailyLogIndex, exIdx: exerciseIndex, name: e.target.value})}
                        onBlur={(e) => {
                            if (editingExerciseName && editingExerciseName.logIdx === dailyLogIndex && editingExerciseName.exIdx === exerciseIndex){
                                processExerciseNameChange(dailyLogIndex, exerciseIndex, e.target.value);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                processExerciseNameChange(dailyLogIndex, exerciseIndex, e.currentTarget.value);
                                e.currentTarget.blur(); 
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.currentTarget.value = exercise.name; 
                                setEditingExerciseName(null);
                                e.currentTarget.blur();
                            }
                        }}
                        className="p-1.5 border border-slate-300 rounded-md text-sm bg-slate-50 hover:bg-slate-100 focus:ring-1 focus:ring-orange-500 text-blue-700 font-semibold w-full sm:w-auto flex-grow mr-2"
                        aria-label={`Exercise name, edit to change for ${exercise.name}`}
                        disabled={!isTodayOrPast}
                    />
                    <button 
                        onClick={() => handleViewHistory(exercise.exerciseId, exercise.name)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 focus:outline-none focus:ring-1 focus:ring-orange-500 flex-shrink-0"
                        aria-label={`View history for ${exercise.name}`}
                    >
                        View History
                    </button>
                  </div>
                  
                  <textarea
                    placeholder="Exercise Notes (e.g., form cues, how it felt)"
                    value={exercise.notes || ''}
                    onChange={(e) => handleExerciseNoteChange(dailyLogIndex, exerciseIndex, e.target.value)}
                    className="w-full p-1.5 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-orange-500 bg-slate-50 text-black mb-3"
                    rows={2}
                    readOnly={!isTodayOrPast}
                    aria-label={`Notes for ${exercise.name}`}
                  />

                  {exercise.sets.map((set, setIndex) => (
                     <div key={set.setNumber} className="flex flex-col sm:grid sm:grid-cols-12 sm:gap-x-2 sm:gap-y-1 items-baseline mb-2 text-sm p-2 border-b border-slate-100 last:border-b-0">
                        {/* Mobile layout: Set # and Remove button */}
                        <div className="flex justify-between items-center w-full sm:hidden mb-1">
                            <span className="text-slate-600 font-medium">Set {set.setNumber}</span>
                            {isTodayOrPast && (
                                <button 
                                    onClick={() => removeSet(dailyLogIndex, exerciseIndex, setIndex)}
                                    className="text-red-500 hover:text-red-700 text-lg p-1 -m-1" // Slightly larger tap target
                                    title="Remove Set"
                                    aria-label={`Remove set ${set.setNumber} for ${exercise.name}`}
                                >
                                    &times;
                                </button>
                            )}
                        </div>
                        {/* Desktop: Set # */}
                        <span className="hidden sm:block sm:col-span-1 text-slate-500 self-center">Set {set.setNumber}</span>

                        {/* Weight Input */}
                        <div className="flex items-center w-full sm:col-span-3 mb-1 sm:mb-0">
                            <label htmlFor={`weight-${dailyLog.date}-${exerciseIndex}-${setIndex}`} className="sm:hidden text-xs text-slate-500 w-10 mr-1">Wt:</label>
                            <input
                                id={`weight-${dailyLog.date}-${exerciseIndex}-${setIndex}`}
                                type="text" 
                                placeholder="Weight"
                                value={set.weight}
                                onChange={(e) => handleSetChange(dailyLogIndex, exerciseIndex, setIndex, 'weight', e.target.value)}
                                className="flex-grow p-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-orange-500 bg-slate-200 text-black"
                                readOnly={!isTodayOrPast}
                                aria-label={`Weight for ${exercise.name} set ${set.setNumber}`}
                            />
                            <span className="hidden sm:block text-xs text-slate-500 ml-1 self-center">kg/lb</span>
                        </div>
                        
                        {/* Reps Input */}
                         <div className="flex items-center w-full sm:col-span-3 mb-1 sm:mb-0">
                             <label htmlFor={`reps-${dailyLog.date}-${exerciseIndex}-${setIndex}`} className="sm:hidden text-xs text-slate-500 w-10 mr-1">Reps:</label>
                            <input
                                id={`reps-${dailyLog.date}-${exerciseIndex}-${setIndex}`}
                                type="text" 
                                placeholder="Reps"
                                value={set.reps}
                                onChange={(e) => handleSetChange(dailyLogIndex, exerciseIndex, setIndex, 'reps', e.target.value)}
                                className="flex-grow p-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-orange-500 bg-slate-200 text-black"
                                readOnly={!isTodayOrPast}
                                aria-label={`Reps for ${exercise.name} set ${set.setNumber}`}
                            />
                        </div>

                        {/* Completed Checkbox */}
                        <div className="w-full sm:col-span-3 flex items-center justify-start sm:justify-center py-1">
                            <input
                                type="checkbox"
                                id={`completed-${dailyLog.date}-${exercise.exerciseId}-${set.setNumber}`}
                                checked={set.completed}
                                onChange={(e) => handleSetChange(dailyLogIndex, exerciseIndex, setIndex, 'completed', e.target.checked)}
                                className="h-5 w-5 text-orange-600 border-slate-400 rounded focus:ring-orange-500 mr-2"
                                disabled={!isTodayOrPast}
                                aria-labelledby={`completed-label-${dailyLog.date}-${exercise.exerciseId}-${set.setNumber}`}
                            />
                            <label htmlFor={`completed-${dailyLog.date}-${exercise.exerciseId}-${set.setNumber}`} id={`completed-label-${dailyLog.date}-${exercise.exerciseId}-${set.setNumber}`} className="text-slate-600 select-none">Done</label>
                        </div>

                        {/* Desktop: Remove Button */}
                        {isTodayOrPast && (
                            <button 
                                onClick={() => removeSet(dailyLogIndex, exerciseIndex, setIndex)}
                                className="hidden sm:flex sm:col-span-2 text-red-500 hover:text-red-700 text-xl focus:outline-none focus:ring-1 focus:ring-red-500 items-center justify-center self-center p-1"
                                title="Remove Set"
                                aria-label={`Remove set ${set.setNumber} for ${exercise.name} on desktop`}
                            >
                                &times;
                            </button>
                        )}
                    </div>
                  ))}
                   {isTodayOrPast && exercise.sets.length < MAX_SETS_PER_EXERCISE && (
                    <button 
                      onClick={() => addSet(dailyLogIndex, exerciseIndex)}
                      className="mt-2 px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      aria-label={`Add set for ${exercise.name}`}
                    >
                      + Add Set
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  );
};

export default WeeklyLog;