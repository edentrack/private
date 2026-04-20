import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface SearchResult {
  id: string;
  type: 'flock' | 'task' | 'expense' | 'customer';
  title: string;
  subtitle: string;
  action: () => void;
}

interface GlobalSearchProps {
  onNavigate: (view: string, data?: any) => void;
}

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const { t } = useTranslation();
  const { profile, currentFarm } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length >= 2) {
      performSearch();
    } else {
      setResults([]);
    }
  }, [query]);

  const performSearch = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    const searchResults: SearchResult[] = [];

    try {
      const searchTerm = `%${query}%`;

      const [flocks, tasks, expenses, customers] = await Promise.all([
        supabase
          .from('flocks')
          .select('id, name, type, status')
          .eq('farm_id', currentFarm.id)
          .ilike('name', searchTerm)
          .limit(5),
        supabase
          .from('tasks')
          .select('id, title, due_date, completed')
          .eq('farm_id', currentFarm.id)
          .ilike('title', searchTerm)
          .limit(5),
        supabase
          .from('expenses')
          .select('id, description, category, amount, date')
          .eq('farm_id', currentFarm.id)
          .ilike('description', searchTerm)
          .limit(5),
        supabase
          .from('customers')
          .select('id, name, email, phone')
          .eq('farm_id', currentFarm.id)
          .ilike('name', searchTerm)
          .limit(5),
      ]);

      if (flocks.data) {
        flocks.data.forEach((flock) => {
          searchResults.push({
            id: flock.id,
            type: 'flock',
            title: flock.name,
            subtitle: `${flock.type} - ${flock.status}`,
            action: () => {
              onNavigate('flock-details', flock);
              setShowResults(false);
              setQuery('');
            },
          });
        });
      }

      if (tasks.data) {
        tasks.data.forEach((task) => {
          searchResults.push({
            id: task.id,
            type: 'task',
            title: task.title,
            subtitle: `Due: ${new Date(task.due_date).toLocaleDateString()} - ${task.completed ? 'Completed' : 'Pending'}`,
            action: () => {
              onNavigate('tasks');
              setShowResults(false);
              setQuery('');
            },
          });
        });
      }

      if (expenses.data) {
        expenses.data.forEach((expense) => {
          searchResults.push({
            id: expense.id,
            type: 'expense',
            title: expense.description,
            subtitle: `${expense.category} - ${currentFarm?.currency_code || currentFarm?.currency || 'CFA'} ${expense.amount}`,
            action: () => {
              onNavigate('expenses');
              setShowResults(false);
              setQuery('');
            },
          });
        });
      }

      if (customers.data) {
        customers.data.forEach((customer) => {
          searchResults.push({
            id: customer.id,
            type: 'customer',
            title: customer.name,
            subtitle: customer.email || customer.phone || 'No contact info',
            action: () => {
              onNavigate('sales');
              setShowResults(false);
              setQuery('');
            },
          });
        });
      }

      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'flock':
        return 'bg-green-100 text-green-700';
      case 'task':
        return 'bg-blue-100 text-blue-700';
      case 'expense':
        return 'bg-orange-100 text-orange-700';
      case 'customer':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-[180px]">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder={t('search.placeholder') || 'Search flocks, tasks, expenses...'}
          className="w-full pl-12 pr-10 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {showResults && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-2xl border border-gray-200 max-h-96 overflow-y-auto z-50">
          {loading ? (
            <div className="p-4 text-center text-gray-500">{t('search.searching') || 'Searching...'}</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-gray-500">{t('search.no_results') || 'No results found'}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={result.action}
                  className="w-full p-4 hover:bg-gray-50 transition-colors text-left flex items-center justify-between group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${getTypeColor(result.type)}`}>
                        {result.type}
                      </span>
                      <p className="font-medium text-gray-900 truncate">{result.title}</p>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
