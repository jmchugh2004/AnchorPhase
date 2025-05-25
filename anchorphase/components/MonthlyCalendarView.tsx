
import React, { useState, useMemo } from 'react';
import { AppData, DailyLog, WeeklyTemplateDay, ExerciseSet } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { formatDateISO, formatDateFriendly } from '../services/dataService';

interface MonthlyCalendarViewProps {
  appData: AppData;
}

type DayStatus = 'rest' | 'empty' | 'partial' | 'completed';

const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({ appData }) => {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  const getDayStatus = (date: Date, logs: DailyLog[], template: WeeklyTemplateDay[]): DayStatus => {
    const isoDate = formatDateISO(date);
    const dayOfWeek = date.getDay();

    const templateDay = template.find(d => d.dayOfWeek === dayOfWeek);
    if (!templateDay || templateDay.exercises.length === 0) {
      return 'rest'; // No exercises planned for this day of the week
    }

    const dailyLog = logs.find(log => log.date === isoDate);
    if (!dailyLog || dailyLog.exercises.length === 0) {
      // Check if any exercises in templateDay have non-zero target sets.
      // If so, it's an 'empty' day (planned but not logged).
      // If all templateDay exercises have 0 target sets (effectively a rest day in template), it's 'rest'.
      const hasPlannedSets = templateDay.exercises.some(te => te.targetSets > 0);
      return hasPlannedSets ? 'empty' : 'rest';
    }

    let totalPlannedSets = 0;
    let totalCompletedSets = 0;

    templateDay.exercises.forEach(templateExercise => {
      totalPlannedSets += templateExercise.targetSets; // Count all planned sets from template
      
      const loggedExercise = dailyLog.exercises.find(le => le.exerciseId === templateExercise.exerciseId);
      if (loggedExercise) {
        loggedExercise.sets.forEach(set => {
          // Only count as completed if the set number is within the targetSets for that exercise
          if (set.completed && set.setNumber <= templateExercise.targetSets) {
            totalCompletedSets++;
          }
        });
      }
    });

    if (totalPlannedSets === 0) return 'rest'; // No actual sets were planned
    if (totalCompletedSets === 0) return 'empty';
    if (totalCompletedSets < totalPlannedSets) return 'partial';
    return 'completed';
  };

  const daysInMonth = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const date = new Date(year, month, 1);
    const days: { dateObj: Date; status: DayStatus; isToday: boolean; isCurrentMonth: boolean }[] = [];

    // Pad days from previous month
    const firstDayOfMonth = date.getDay(); // 0 for Sunday
    for (let i = 0; i < firstDayOfMonth; i++) {
      const prevMonthDay = new Date(year, month, i - firstDayOfMonth + 1);
      days.push({ 
        dateObj: prevMonthDay, 
        status: 'rest', // Or fetch status if you want to show previous month's data
        isToday: false, 
        isCurrentMonth: false 
      });
    }

    while (date.getMonth() === month) {
      const today = new Date();
      const isToday = date.getFullYear() === today.getFullYear() &&
                      date.getMonth() === today.getMonth() &&
                      date.getDate() === today.getDate();
      days.push({ 
        dateObj: new Date(date), 
        status: getDayStatus(new Date(date), appData.dailyLogs, appData.weeklyTemplate),
        isToday,
        isCurrentMonth: true
      });
      date.setDate(date.getDate() + 1);
    }

    // Pad days from next month
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const lastDayWeekday = lastDayOfMonth.getDay(); // 0 for Sunday, 6 for Saturday
    if (lastDayWeekday < 6) { // if not Saturday
        for (let i = 1; i <= 6 - lastDayWeekday; i++) {
            const nextMonthDay = new Date(year, month + 1, i);
            days.push({
                dateObj: nextMonthDay,
                status: 'rest', // Or fetch status for next month's preview
                isToday: false,
                isCurrentMonth: false
            });
        }
    }


    return days;
  }, [currentMonthDate, appData.dailyLogs, appData.weeklyTemplate]);

  const changeMonth = (offset: number) => {
    setCurrentMonthDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + offset);
      return newDate;
    });
  };

  const getDotColor = (status: DayStatus): string => {
    switch (status) {
      case 'empty': return 'bg-red-500';
      case 'partial': return 'bg-orange-500';
      case 'completed': return 'bg-blue-600'; // Using the primary blue
      default: return ''; // 'rest' or no plan
    }
  };

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg">
      <header className="flex justify-between items-center mb-6 border-b pb-3">
        <button 
          onClick={() => changeMonth(-1)} 
          className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
          aria-label="Previous month"
        >
          &lt; Prev
        </button>
        <h2 className="text-xl sm:text-2xl font-semibold text-blue-700">
          {formatDateFriendly(currentMonthDate).replace(/\s\d+,\s/, ' ')} {/* Month Year */}
        </h2>
        <button 
          onClick={() => changeMonth(1)} 
          className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
          aria-label="Next month"
        >
          Next &gt;
        </button>
      </header>

      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="py-2 text-center font-medium text-sm text-slate-600 bg-slate-100">
            {day.substring(0, 3)}
          </div>
        ))}
        {daysInMonth.map(({ dateObj, status, isToday, isCurrentMonth }, index) => (
          <div 
            key={index} 
            className={`p-2 h-24 sm:h-28 flex flex-col items-center justify-start relative 
                        ${isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-100 text-slate-400'}`}
          >
            <span 
              className={`text-xs sm:text-sm mb-1 ${isToday && isCurrentMonth ? 'font-bold text-orange-600 rounded-full bg-orange-100 w-6 h-6 flex items-center justify-center' : ''}`}
            >
              {dateObj.getDate()}
            </span>
            {isCurrentMonth && status !== 'rest' && (
              <span 
                className={`absolute bottom-2 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full ${getDotColor(status)}`}
                title={`Status: ${status}`}
                aria-label={`Workout status for ${formatDateFriendly(dateObj)} is ${status}`}
              ></span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <div className="flex items-center"><span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>Planned / Not Started</div>
        <div className="flex items-center"><span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>Partially Completed</div>
        <div className="flex items-center"><span className="w-3 h-3 bg-blue-600 rounded-full mr-2"></span>Fully Completed</div>
        <div className="flex items-center"><span className="w-3 h-3 border border-slate-300 rounded-full mr-2"></span>Rest Day / No Plan</div>
      </div>
    </div>
  );
};

export default MonthlyCalendarView;
