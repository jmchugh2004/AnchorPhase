
import React, { useState, useEffect, useCallback } from 'react';
import { AppData, View } from './types';
import { loadData, saveData } from './services/dataService';
import ExerciseSetup from './components/ExerciseSetup';
import WeeklyLog from './components/WeeklyLog';
import ProgressChart from './components/ProgressChart';
import MonthlyCalendarView from './components/MonthlyCalendarView';
import GroupManagement from './components/GroupManagement'; // Import GroupManagement
import { APP_NAME } from './constants';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Log);
  const [appData, setAppData] = useState<AppData>(loadData());

  useEffect(() => {
    saveData(appData);
  }, [appData]);

  const handleDataChange = useCallback((newData: AppData) => {
    setAppData(newData);
  }, []);

  const renderView = () => {
    switch (currentView) {
      case View.Setup:
        return <ExerciseSetup data={appData} onDataChange={handleDataChange} />;
      case View.Log:
        return <WeeklyLog data={appData} onDataChange={handleDataChange} />;
      case View.Progress:
        return <ProgressChart data={appData} />;
      case View.Calendar:
        return <MonthlyCalendarView appData={appData} />;
      case View.Groups: // Add case for Groups view
        return <GroupManagement appData={appData} onDataChange={handleDataChange} />;
      default:
        return <WeeklyLog data={appData} onDataChange={handleDataChange} />;
    }
  };
  
  const NavButton: React.FC<{view: View, label: string}> = ({view, label}) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`px-3 sm:px-4 py-2 rounded-md transition-colors duration-150 ease-in-out text-sm font-medium
                  ${currentView === view 
                    ? 'bg-orange-500 text-white shadow-md' 
                    : 'bg-blue-200 text-blue-700 hover:bg-blue-300 hover:text-blue-800'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight mb-3 sm:mb-0">
            ⚓ {APP_NAME}
          </h1>
          <nav className="flex flex-wrap justify-center sm:justify-end space-x-2 sm:space-x-3">
            <NavButton view={View.Setup} label="Setup Program" />
            <NavButton view={View.Log} label="Log Workouts" />
            <NavButton view={View.Progress} label="View Progress" />
            <NavButton view={View.Calendar} label="Calendar" />
            <NavButton view={View.Groups} label="Groups" /> {/* Add Groups button */}
          </nav>
        </div>
      </header>
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderView()}
      </main>

      <footer className="text-center py-6 text-sm text-slate-500 border-t border-slate-200 mt-12">
        <p>&copy; {new Date().getFullYear()} {APP_NAME}. Chart your course, lift your anchors!</p>
      </footer>
    </div>
  );
};

export default App;
