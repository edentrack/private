import { useState } from 'react';
import { Clock, Calendar, Plus, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TodayTasksView } from './TodayTasksView';
import { UpcomingTasksView } from './UpcomingTasksView';
import { UnifiedTaskSettings } from './UnifiedTaskSettings';
import { AddTaskModal } from './AddTaskModal';

interface TasksPageProps {
  onNavigate: (view: string) => void;
}

export function TasksPage({ onNavigate: _onNavigate }: TasksPageProps) {
  const { currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming'>('today');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const canManage = currentRole === 'owner' || currentRole === 'manager';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 text-sm mt-0.5">Daily farm operations</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              title="Task Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        )}
      </div>

      <div className="glass-light rounded-full p-1.5 flex gap-1">
        <button
          onClick={() => setActiveTab('today')}
          className={`nav-pill flex items-center gap-2 flex-1 justify-center ${activeTab === 'today' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
        >
          <Clock className="w-4 h-4" />
          Today
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`nav-pill flex items-center gap-2 flex-1 justify-center ${activeTab === 'upcoming' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
        >
          <Calendar className="w-4 h-4" />
          Upcoming
        </button>
      </div>

      {activeTab === 'today' ? <TodayTasksView /> : <UpcomingTasksView />}

      {showAddTask && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          onSuccess={() => setShowAddTask(false)}
        />
      )}

      {showSettings && (
        <UnifiedTaskSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
