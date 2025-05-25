
import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { AppData, OneRepMaxDataPoint, Exercise } from '../types';
import { calculate1RMData } from '../services/dataService';

interface ProgressChartProps {
  data: AppData;
}

const ProgressChart: React.FC<ProgressChartProps> = ({ data }) => {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');

  const allExercises = data.exercises;
  const oneRMData: OneRepMaxDataPoint[] = useMemo(() => calculate1RMData(data), [data]);

  const chartData = useMemo(() => {
    if (!selectedExerciseId) return [];
    const exerciseName = allExercises.find(ex => ex.id === selectedExerciseId)?.name;
    if (!exerciseName) return [];
    return oneRMData
      .filter(d => d.exerciseName === exerciseName)
      .map(d => ({ date: d.date, 'Predicted 1RM': d.predicted1RM }));
  }, [oneRMData, selectedExerciseId, allExercises]);

  if (allExercises.length === 0) {
    return (
      <div className="p-6 bg-white shadow-lg rounded-lg">
        <h2 className="text-2xl font-semibold text-blue-700 border-b pb-2 mb-4">1RM Progress</h2>
        <p className="text-slate-500">No exercises defined. Please set up exercises first in the 'Setup' tab.</p>
      </div>
    );
  }
  
  return (
    <div className="p-6 bg-white shadow-lg rounded-lg">
      <h2 className="text-2xl font-semibold text-blue-700 border-b pb-2 mb-4">1RM Progress</h2>
      
      <div className="mb-6">
        <label htmlFor="exerciseSelect" className="block text-sm font-medium text-slate-700 mb-1">Select Exercise:</label>
        <select
          id="exerciseSelect"
          value={selectedExerciseId}
          onChange={(e) => setSelectedExerciseId(e.target.value)}
          className="w-full md:w-1/2 p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-200 text-black"
        >
          <option value="">-- Select an Exercise --</option>
          {allExercises.map((ex: Exercise) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      {selectedExerciseId && chartData.length > 0 && (
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0"/>
              <XAxis dataKey="date" stroke="#4A5568" />
              <YAxis label={{ value: 'Predicted 1RM (kg/lb)', angle: -90, position: 'insideLeft', fill: '#4A5568' }} stroke="#4A5568" />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: '#cccccc', borderRadius: '0.5rem' }}
                labelStyle={{ color: '#1A202C', fontWeight: 'bold' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="Predicted 1RM" stroke="#FF7518" strokeWidth={2} activeDot={{ r: 6 }} dot={{fill: "#FF7518", stroke: "#FF7518", r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {selectedExerciseId && chartData.length === 0 && (
        <p className="text-slate-500 mt-4">No data available for the selected exercise. Log some workouts first!</p>
      )}
       {!selectedExerciseId && (
        <p className="text-slate-500 mt-4">Please select an exercise to view its 1RM progression.</p>
      )}
    </div>
  );
};

export default ProgressChart;