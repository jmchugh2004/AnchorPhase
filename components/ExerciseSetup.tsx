
import React, { useState, useCallback, useEffect } from 'react';
import { AppData, Exercise, WeeklyTemplateDay, WeeklyTemplateExercise, ParsedCSVExercisePlanItem, Group } from '../types';
import { addExercise, updateWeeklyTemplate, parseCSVExercisePlan, parseFullWorkoutPlanFromText, desyncActiveGroup, applyGroupTemplateToUser } from '../services/dataService';
import { DAYS_OF_WEEK } from '../constants';

interface ExerciseSetupProps {
  data: AppData;
  onDataChange: (newData: AppData) => void;
}

const ExerciseSetup: React.FC<ExerciseSetupProps> = ({ data, onDataChange }) => {
  const [newExerciseName, setNewExerciseName] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<WeeklyTemplateDay[]>(
    () => JSON.parse(JSON.stringify(data.weeklyTemplate)) 
  );
  const [selectedDayForImport, setSelectedDayForImport] = useState<number>(1);
  const [fullPlanText, setFullPlanText] = useState('');

  const activeGroup: Group | undefined = data.activeSyncedGroupId ? data.groups.find(g => g.id === data.activeSyncedGroupId) : undefined;

  useEffect(() => {
    setEditingTemplate(JSON.parse(JSON.stringify(data.weeklyTemplate)));
  }, [data.weeklyTemplate, data.activeSyncedGroupId]); // Also re-sync if activeSyncedGroupId changes


  const handleAnyTemplateModification = (callback: (currentData: AppData) => AppData) => {
    let modifiedData = { ...data };
    if (modifiedData.activeSyncedGroupId) {
      modifiedData = desyncActiveGroup(modifiedData);
    }
    modifiedData = callback(modifiedData);
    onDataChange(modifiedData);
  };


  const handleAddExerciseManually = () => {
    const trimmedName = newExerciseName.trim();
    if (trimmedName) {
      // No direct template modification, so don't need handleAnyTemplateModification
      const { newData, newExercise } = addExercise(data, trimmedName);
      if (newExercise && !data.exercises.some(ex => ex.id === newExercise.id)) {
         onDataChange(newData); 
      } else if (newExercise && data.exercises.some(ex => ex.id === newExercise.id)) {
        alert(`Exercise "${newExercise.name}" already exists.`);
      }
      setNewExerciseName('');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const planItems = parseCSVExercisePlan(text);
        
        handleAnyTemplateModification(currentData => {
          let tempAppData = { ...currentData, exercises: [...currentData.exercises] }; 
          let newExercisesAddedDuringImport = 0;
          const newTemplateDayExercises: WeeklyTemplateExercise[] = [];

          planItems.forEach(item => {
            const originalExercise = tempAppData.exercises.find(ex => ex.name.toLowerCase() === item.name.toLowerCase().trim());
            const addResult = addExercise(tempAppData, item.name.trim()); // Use tempAppData to accumulate new exercises
            tempAppData = addResult.newData; 
            const currentOrNewExercise = addResult.newExercise;

            if (currentOrNewExercise && !originalExercise) {
              newExercisesAddedDuringImport++;
            }

            if (currentOrNewExercise) { 
              newTemplateDayExercises.push({ 
                exerciseId: currentOrNewExercise.id, 
                targetSets: item.targetSets, 
                targetReps: item.targetReps,
              });
            }
          });
          
          const newEditingTemplate = JSON.parse(JSON.stringify(editingTemplate)); // Start with current UI state
          // But if we're desyncing, editingTemplate might not yet reflect currentData.weeklyTemplate if a sync just happened
          // Let's base it on currentData.weeklyTemplate if desyncing
          const baseTemplateForEdit = currentData.activeSyncedGroupId === undefined ? editingTemplate : JSON.parse(JSON.stringify(currentData.weeklyTemplate));

          const dayToUpdate = baseTemplateForEdit.find((d: WeeklyTemplateDay) => d.dayOfWeek === selectedDayForImport);
          if (dayToUpdate) {
            dayToUpdate.exercises = newTemplateDayExercises;
          } else { 
               baseTemplateForEdit[selectedDayForImport] = { dayOfWeek: selectedDayForImport, exercises: newTemplateDayExercises };
          }
          setEditingTemplate(baseTemplateForEdit); // Update UI state

          alert(`${planItems.length} exercise plan items processed for ${DAYS_OF_WEEK[selectedDayForImport]}. ${newExercisesAddedDuringImport > 0 ? `${newExercisesAddedDuringImport} new exercises were added to master list.` : ''} Template preview updated. ${currentData.activeSyncedGroupId ? 'This template is now a local copy.' : ''} Review and save.`);
          
          // Only return exercises if they changed. Template changes are handled by `saveTemplate`.
          return { ...tempAppData, exercises: tempAppData.exercises }; 
        });
      };
      reader.readAsText(file);
      event.target.value = ''; 
    }
  };

  const handleParseAndImportFullPlan = () => {
    const parsedPlanByDay = parseFullWorkoutPlanFromText(fullPlanText);

    if (Object.keys(parsedPlanByDay).length === 0) {
        alert("Could not parse exercises. Check format.");
        return;
    }
    
    handleAnyTemplateModification(currentData => {
        let tempAppData = { ...currentData, exercises: [...currentData.exercises] }; 
        let newExercisesAddedCount = 0;

        const allExerciseNamesFromPlan = new Set<string>();
        Object.values(parsedPlanByDay).forEach(dayExercises => {
            dayExercises.forEach(ex => allExerciseNamesFromPlan.add(ex.name));
        });

        allExerciseNamesFromPlan.forEach(name => {
            const exerciseExistsInOriginalData = tempAppData.exercises.some(ex => ex.name.toLowerCase() === name.toLowerCase());
            const addResult = addExercise(tempAppData, name); 
            tempAppData = addResult.newData; 
            if (addResult.newExercise && !exerciseExistsInOriginalData) {
                newExercisesAddedCount++;
            }
        });
        
        const baseTemplateForEdit = currentData.activeSyncedGroupId === undefined ? editingTemplate : JSON.parse(JSON.stringify(currentData.weeklyTemplate));
        const newEditingTemplateState = JSON.parse(JSON.stringify(baseTemplateForEdit));

        Object.entries(parsedPlanByDay).forEach(([dayOfWeekStr, exercisesForDay]) => {
            const dayOfWeek = parseInt(dayOfWeekStr, 10);
            const templateDayExercises: WeeklyTemplateExercise[] = [];

            exercisesForDay.forEach(parsedEx => {
                const exercise = tempAppData.exercises.find(e => e.name.toLowerCase() === parsedEx.name.toLowerCase());
                if (exercise) { 
                    templateDayExercises.push({
                        exerciseId: exercise.id,
                        targetSets: parsedEx.targetSets,
                        targetReps: parsedEx.targetReps,
                        originalIndex: parsedEx.originalIndex 
                    });
                }
            });
            
            let dayInTemplate = newEditingTemplateState.find((d: WeeklyTemplateDay) => d.dayOfWeek === dayOfWeek);
            if (dayInTemplate) {
                dayInTemplate.exercises = templateDayExercises;
            } else { 
                newEditingTemplateState.push({ dayOfWeek, exercises: templateDayExercises });
                newEditingTemplateState.sort((a: WeeklyTemplateDay, b: WeeklyTemplateDay) => a.dayOfWeek - b.dayOfWeek); 
            }
        });
        
        setEditingTemplate(newEditingTemplateState);
        setFullPlanText(''); 
        
        const updatedDays = Object.keys(parsedPlanByDay).map(d => DAYS_OF_WEEK[parseInt(d)]).filter(Boolean).join(', ');
        alert(`Parsed. ${newExercisesAddedCount} new exercises added. ${updatedDays ? `Template updated for: ${updatedDays}.` : ''} ${currentData.activeSyncedGroupId ? 'This template is now a local copy.' : ''} Review and save.`);

        return { ...tempAppData, exercises: tempAppData.exercises };
    });
  };

  const handleTemplateExerciseChange = (dayIndex: number, exerciseId: string, targetSets: number, targetReps?: string) => {
    const newTemplate = JSON.parse(JSON.stringify(editingTemplate)); 
    const dayObject = newTemplate.find((d:WeeklyTemplateDay) => d.dayOfWeek === dayIndex);
    if (!dayObject) return; 

    const dayExercises = dayObject.exercises;
    const existingExIndex = dayExercises.findIndex((ex: WeeklyTemplateExercise) => ex.exerciseId === exerciseId);

    if (targetSets > 0) {
      const originalIndexToPreserve = existingExIndex > -1 ? dayExercises[existingExIndex].originalIndex : undefined;
      const updatedExercise = { 
        exerciseId, 
        targetSets, 
        targetReps: targetReps === undefined ? dayExercises[existingExIndex]?.targetReps : targetReps || '',
        originalIndex: originalIndexToPreserve 
      };
      if (existingExIndex > -1) {
        dayExercises[existingExIndex] = updatedExercise;
      } else {
        dayExercises.push(updatedExercise);
      }
    } else { 
      if (existingExIndex > -1) {
        dayExercises.splice(existingExIndex, 1);
      }
    }
    setEditingTemplate(newTemplate);
    // This direct UI change should trigger desync on save, or if we want immediate feedback:
    if (data.activeSyncedGroupId) {
        onDataChange(desyncActiveGroup(data));
    }
  };
  
  const getExerciseNameById = useCallback((id: string) => {
    return data.exercises.find(ex => ex.id === id)?.name || 'Unknown Exercise';
  }, [data.exercises]);

  const saveTemplate = () => {
    const completeTemplate = DAYS_OF_WEEK.map((_, dayIndex) => {
        const existingDay = editingTemplate.find(d => d.dayOfWeek === dayIndex);
        return existingDay || { dayOfWeek: dayIndex, exercises: [] };
    });
    // updateWeeklyTemplate already handles desyncing.
    onDataChange(updateWeeklyTemplate(data, completeTemplate));
    alert('Weekly template saved!');
  };
  
  const handleClearTemplate = () => {
    if (window.confirm("Are you sure you want to clear all exercises from the weekly template preview?")) {
      const clearedTemplate = DAYS_OF_WEEK.map((_, dayIndex) => ({
        dayOfWeek: dayIndex,
        exercises: [],
      }));
      setEditingTemplate(clearedTemplate);
      // Clearing should also desync
      if (data.activeSyncedGroupId) {
        onDataChange(desyncActiveGroup(data));
         alert("Template preview cleared. This template is now a local copy. Click 'Save Weekly Template' to apply this change.");
      } else {
        alert("Template preview cleared. Click 'Save Weekly Template' to apply this change.");
      }
    }
  };

  const handleResyncFromGroup = () => {
    if (activeGroup && window.confirm(`Re-sync template from group "${activeGroup.name}"? Your current unsaved template changes will be lost.`)) {
      onDataChange(applyGroupTemplateToUser(data, activeGroup.id));
      alert(`Template re-synced from "${activeGroup.name}".`);
    }
  };

  const isTemplateEmpty = editingTemplate.every(d => d.exercises.length === 0);

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg space-y-6">
      <header className="border-b pb-2 mb-4">
        <h2 className="text-2xl font-semibold text-blue-700">Setup Training Program</h2>
      </header>

      {activeGroup && (
        <div className="p-3 bg-blue-100 border border-blue-300 rounded-md text-sm text-blue-700">
          <p>
            This template is currently synced with the group: <strong>{activeGroup.name}</strong>.
            Any local edits will make this a local copy and unlink it from the group's shared template.
          </p>
          <button 
            onClick={handleResyncFromGroup}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
          >
            Re-sync From Group (Overwrite Local Changes)
          </button>
        </div>
      )}
      {!activeGroup && data.activeSyncedGroupId && ( // Edge case: activeSyncedGroupId exists but group was deleted
         <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-md text-sm text-yellow-700">
          <p>This template was previously synced with a group that may no longer exist in your list. It is now a local copy.</p>
        </div>
      )}


      <section className="space-y-3">
        <h3 className="text-xl font-medium text-blue-600">Manage Master Exercises List</h3>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            placeholder="New Exercise Name (e.g., Squat)"
            className="flex-grow p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-200 text-black"
            aria-label="New Exercise Name"
          />
          <button
            onClick={handleAddExerciseManually}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
          >
            Add Exercise
          </button>
        </div>
         {data.exercises.length > 0 && (
          <div className="mt-3">
            <h4 className="text-md font-normal text-slate-500">Current Master Exercises ({data.exercises.length}):</h4>
            <ul className="list-disc list-inside text-slate-600 max-h-40 overflow-y-auto bg-slate-50 p-3 border rounded-md">
              {data.exercises.map(ex => <li key={ex.id} className="text-sm">{ex.name}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t pt-6">
         <h3 className="text-xl font-medium text-blue-600">Import Options for Template</h3>
        <div className="space-y-2 p-4 border rounded-md bg-slate-50 shadow-sm">
          <h4 className="text-lg font-normal text-blue-700">1. Import Daily Plan (CSV)</h4>
          <label htmlFor="dayForImportSelect" className="block text-sm font-medium text-slate-700">
            Select Day for CSV Import:
          </label>
          <select 
            id="dayForImportSelect"
            value={selectedDayForImport}
            onChange={(e) => setSelectedDayForImport(parseInt(e.target.value))}
            className="w-full md:w-2/3 lg:w-1/2 p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-200 text-black"
            aria-label="Select day for CSV import"
          >
            {DAYS_OF_WEEK.map((dayName, index) => (
              <option key={index} value={index}>{dayName}</option>
            ))}
          </select>
          <label htmlFor="csvImport" className="mt-2 block text-sm font-medium text-slate-700">
            Upload CSV for {DAYS_OF_WEEK[selectedDayForImport]} (Format: Name,Sets,Reps):
          </label>
          <input
            type="file"
            id="csvImport"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
            aria-describedby="csvFormatHint"
          />
          <p id="csvFormatHint" className="text-xs text-slate-500">Each row: Exercise Name, Target Sets, Target Reps (optional).</p>
        </div>

        <div className="space-y-2 p-4 border rounded-md bg-slate-50 shadow-sm">
           <h4 className="text-lg font-normal text-blue-700">2. Paste Full Plan Text</h4>
          <label htmlFor="fullPlanTextImport" className="block text-sm font-medium text-slate-700">
            Paste spreadsheet-like workout plan:
          </label>
          <textarea
            id="fullPlanTextImport"
            rows={8}
            value={fullPlanText}
            onChange={(e) => setFullPlanText(e.target.value)}
            placeholder="Paste full plan. Assumes columns for Mon, Tue, Thu, Fri with headers like 'movement sets reps', or single day format."
            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-200 text-black"
            aria-label="Paste full workout plan text"
          />
          <button
            onClick={handleParseAndImportFullPlan}
            className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
          >
            Parse & Import Full Plan
          </button>
           <p className="text-xs text-slate-500">Parser expects header with 'movement', 'sets', 'reps'. Columns interpreted as Mon, Tue, Thu, Fri or single day on its own line.</p>
        </div>
      </section>
      
      <section className="space-y-3 border-t pt-6">
        <h3 className="text-xl font-medium text-blue-600">Define Weekly Template</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DAYS_OF_WEEK.map((dayName, dayIndex) => {
            const templateDay = editingTemplate.find(td => td.dayOfWeek === dayIndex) || { dayOfWeek: dayIndex, exercises: [] };
            const exercisesForThisDay = templateDay.exercises.map(te => ({
                ...te, 
                name: getExerciseNameById(te.exerciseId)
            })).sort((a, b) => {
                const aHasIndex = a.originalIndex !== undefined;
                const bHasIndex = b.originalIndex !== undefined;

                if (aHasIndex && bHasIndex) {
                    return a.originalIndex! - b.originalIndex!; 
                } else if (aHasIndex) {
                    return -1; 
                } else if (bHasIndex) {
                    return 1;  
                }
                return a.name.localeCompare(b.name); 
            });

            return (
            <div key={dayIndex} className="p-4 border border-slate-200 rounded-md bg-slate-50 shadow-sm">
              <h4 className="font-semibold text-blue-700 mb-3">{dayName}</h4>
              {data.exercises.length === 0 && <p className="text-xs text-slate-400">Add exercises to master list to schedule them.</p>}
              
              {exercisesForThisDay.map(templateExercise => (
                  <div key={templateExercise.exerciseId} className="flex items-center justify-between mb-2">
                    <label htmlFor={`ex-sets-${dayIndex}-${templateExercise.exerciseId}`} className="text-sm text-slate-600 flex-1 mr-2 truncate" title={templateExercise.name}>{templateExercise.name}</label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        id={`ex-sets-${dayIndex}-${templateExercise.exerciseId}`}
                        min="0" max="20"
                        value={templateExercise.targetSets || 0}
                        onChange={(e) => handleTemplateExerciseChange(dayIndex, templateExercise.exerciseId, parseInt(e.target.value), templateExercise.targetReps)}
                        className="w-16 p-1.5 border border-slate-300 rounded-md text-sm mr-1 text-center bg-slate-200 text-black focus:ring-1 focus:ring-orange-500"
                        placeholder="Sets"
                        aria-label={`${templateExercise.name} target sets`}
                      />
                      <span className="text-xs text-slate-400 mr-1">x</span>
                      <input
                        type="text"
                        id={`ex-reps-${dayIndex}-${templateExercise.exerciseId}`}
                        value={templateExercise.targetReps || ''}
                        onChange={(e) => handleTemplateExerciseChange(dayIndex, templateExercise.exerciseId, templateExercise.targetSets || 0, e.target.value)}
                        className="w-16 p-1.5 border border-slate-300 rounded-md text-sm text-center bg-slate-200 text-black focus:ring-1 focus:ring-orange-500"
                        placeholder="Reps"
                        aria-label={`${templateExercise.name} target reps`}
                      />
                    </div>
                  </div>
                ))}

              {data.exercises.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                    <select 
                        className="w-full p-1.5 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-orange-500 bg-slate-200 text-black"
                        value=""
                        aria-label={`Add exercise to ${dayName}`}
                        onChange={(e) => {
                            if (e.target.value) { 
                                const existingTemplateEx = templateDay.exercises.find(ex => ex.exerciseId === e.target.value);
                                if (!existingTemplateEx) { 
                                    handleTemplateExerciseChange(dayIndex, e.target.value, 1, ''); 
                                }
                                e.target.value = ""; 
                            }
                        }}
                    >
                        <option value="">-- Add exercise to {dayName} --</option>
                        {data.exercises
                            .filter(ex => !templateDay.exercises.find(te => te.exerciseId === ex.id))
                            .map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))}
                    </select>
                </div>
              )}
              
              {templateDay.exercises.length === 0 && data.exercises.length > 0 && (
                 <p className="text-xs text-center text-slate-400 mt-2">No exercises scheduled for {dayName}.</p>
              )}
            </div>
          )})}
        </div>
        <div className="mt-6 text-center space-y-3">
            <button
                onClick={handleClearTemplate}
                className="px-6 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 mr-3"
            >
                Clear Entire Weekly Template
            </button>
            <button
                onClick={saveTemplate}
                className="px-8 py-2.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 disabled:bg-slate-400"
                disabled={data.exercises.length === 0 && isTemplateEmpty}
            >
                Save Weekly Template
            </button>
        </div>
      </section>
    </div>
  );
};

export default ExerciseSetup;
