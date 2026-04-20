import { useState } from 'react';
import { Settings, Calendar, Clock, Plus, Egg } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TodayTasksView } from './TodayTasksView';
import { UpcomingTasksView } from './UpcomingTasksView';
import { UnifiedTaskSettings } from './UnifiedTaskSettings';
import { AddTaskModal } from './AddTaskModal';
import { EggIntervalTaskTracker } from './egg/EggIntervalTaskTracker';

interface TasksPageProps {
  onNavigate: (view: string) => void;
}

export function TasksPage({ onNavigate: _onNavigate }: TasksPageProps) {
  const { currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'eggs'>('today');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  const canManageTasks = currentRole === 'owner' || currentRole === 'manager';
  const canViewUpcoming = canManageTasks;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 mt-1">Manage your farm tasks and daily operations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canManageTasks && (
            <>
              <button
                onClick={() => setShowSettings(true)}
                className="btn-secondary flex items-center gap-2"
                id="tasks-settings-button"
              >
                <Settings className="w-5 h-5" />
                Task Settings
              </button>
              <button
                onClick={() => setShowAddTaskModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Custom Task
              </button>
            </>
          )}
        </div>
      </div>

      <div className="glass-light rounded-full p-1.5 flex w-full overflow-x-auto whitespace-nowrap gap-1">
        <button
          onClick={() => setActiveTab('today')}
          className={`nav-pill flex items-center gap-2 ${
            activeTab === 'today' ? 'nav-pill-active' : 'nav-pill-inactive'
          }`}
        >
          <Clock className="w-4 h-4" />
          Today
        </button>
        <button
          onClick={() => setActiveTab('eggs')}
          className={`nav-pill flex items-center gap-2 ${
            activeTab === 'eggs' ? 'nav-pill-active' : 'nav-pill-inactive'
          }`}
        >
          <Egg className="w-4 h-4" />
          Eggs
        </button>
        {canViewUpcoming && (
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`nav-pill flex items-center gap-2 ${
              activeTab === 'upcoming' ? 'nav-pill-active' : 'nav-pill-inactive'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Upcoming
          </button>
        )}
      </div>

      {activeTab === 'today' ? (
        <TodayTasksView />
      ) : activeTab === 'eggs' ? (
        <EggIntervalTaskTracker />
      ) : (
        <UpcomingTasksView />
      )}

      {showAddTaskModal && (
        <AddTaskModal
          onClose={() => setShowAddTaskModal(false)}
          onSuccess={() => {
            setShowAddTaskModal(false);
          }}
        />
      )}

      {showSettings && (
        <UnifiedTaskSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
