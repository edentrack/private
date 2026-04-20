import { useState, useRef, useEffect } from 'react';
import { Send, HelpCircle, ArrowRight, X, MessageCircle, ChevronRight, LayoutDashboard, CheckSquare, Package, DollarSign, Bird, Syringe, ShoppingCart, Users, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HelperAssistantProps {
  onNavigate: (view: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  buttons?: NavigationButton[];
}

interface NavigationButton {
  label: string;
  route: string;
  icon?: string;
}

interface FAQEntry {
  keywords: string[];
  response: string;
  buttons?: NavigationButton[];
}

const FAQ_DATABASE: FAQEntry[] = [
  {
    keywords: ['task', 'tasks', 'todo', 'to-do', 'checklist', 'daily task'],
    response: 'Tasks help you track daily farm operations. You can view today\'s tasks, create custom tasks, and configure recurring templates.',
    buttons: [
      { label: 'View Tasks', route: 'tasks' },
      { label: 'Task Settings', route: 'tasks' },
    ],
  },
  {
    keywords: ['expense', 'cost', 'spending', 'money', 'budget', 'pay', 'payment'],
    response: 'Track all your farm expenses including feed, medication, equipment, and labor costs. You can also link expenses to inventory.',
    buttons: [
      { label: 'View Expenses', route: 'expenses' },
      { label: 'Add Expense', route: 'expenses' },
    ],
  },
  {
    keywords: ['inventory', 'stock', 'feed', 'supply', 'supplies', 'storage'],
    response: 'Manage your feed stock, medications, and other supplies. Track quantities and get alerts when stock is low.',
    buttons: [
      { label: 'View Inventory', route: 'inventory' },
    ],
  },
  {
    keywords: ['flock', 'flocks', 'bird', 'birds', 'chicken', 'chickens', 'hen', 'hens', 'broiler', 'layer'],
    response: 'Manage your flocks, track bird counts, log mortality, and monitor flock health and weight.',
    buttons: [
      { label: 'View Flocks', route: 'flocks' },
      { label: 'Add Flock', route: 'flocks' },
    ],
  },
  {
    keywords: ['vaccine', 'vaccination', 'vaccinate', 'shot', 'immunize', 'health'],
    response: 'Schedule and track vaccinations for your flocks. Set reminders and mark vaccinations as completed.',
    buttons: [
      { label: 'Vaccination Schedule', route: 'vaccinations' },
    ],
  },
  {
    keywords: ['sale', 'sales', 'sell', 'customer', 'invoice', 'receipt', 'revenue', 'income'],
    response: 'Record sales, manage customers, create invoices, and track your farm revenue.',
    buttons: [
      { label: 'View Sales', route: 'sales' },
      { label: 'New Sale', route: 'sales' },
    ],
  },
  {
    keywords: ['team', 'worker', 'staff', 'employee', 'member', 'invite', 'role'],
    response: 'Manage your farm team members, invite new workers, and assign roles (owner, manager, worker, viewer).',
    buttons: [
      { label: 'Team Management', route: 'team' },
    ],
  },
  {
    keywords: ['shift', 'schedule', 'work hours', 'clock in', 'time'],
    response: 'Create and manage worker shifts, track work hours, and set up recurring schedules.',
    buttons: [
      { label: 'View Shifts', route: 'shifts' },
    ],
  },
  {
    keywords: ['payroll', 'salary', 'wage', 'pay worker', 'compensation'],
    response: 'Calculate payroll based on shifts, set compensation rates, and manage worker payments.',
    buttons: [
      { label: 'Payroll', route: 'payroll' },
    ],
  },
  {
    keywords: ['dashboard', 'home', 'overview', 'summary', 'start'],
    response: 'Your dashboard shows a quick overview of your farm including bird counts, pending tasks, and recent activity.',
    buttons: [
      { label: 'Go to Dashboard', route: 'dashboard' },
    ],
  },
  {
    keywords: ['analytics', 'report', 'insight', 'kpi', 'metric', 'performance', 'chart'],
    response: 'View detailed analytics and KPIs including mortality rates, feed conversion, and financial performance.',
    buttons: [
      { label: 'View Insights', route: 'insights' },
      { label: 'Analytics', route: 'analytics' },
    ],
  },
  {
    keywords: ['setting', 'settings', 'configure', 'preference', 'account'],
    response: 'Configure your farm settings, manage permissions, and customize your preferences.',
    buttons: [
      { label: 'Settings', route: 'settings' },
    ],
  },
  {
    keywords: ['egg', 'eggs', 'collection', 'tray', 'lay', 'laying'],
    response: 'For layer flocks, you can track daily egg collection, record broken eggs, and manage egg inventory.',
    buttons: [
      { label: 'View Inventory', route: 'inventory' },
      { label: 'View Flocks', route: 'flocks' },
    ],
  },
  {
    keywords: ['mortality', 'death', 'died', 'dead', 'loss', 'cull'],
    response: 'Log bird mortality to keep accurate flock counts. Track reasons and dates for analysis.',
    buttons: [
      { label: 'View Flocks', route: 'flocks' },
    ],
  },
  {
    keywords: ['weight', 'weigh', 'weighing', 'growth', 'gain'],
    response: 'Track bird weights regularly to monitor growth performance and compare against targets.',
    buttons: [
      { label: 'View Flocks', route: 'flocks' },
    ],
  },
  {
    keywords: ['forecast', 'predict', 'plan', 'budget', 'future'],
    response: 'Use the forecast feature to plan upcoming expenses and estimate costs for each week of production.',
    buttons: [
      { label: 'View Forecast', route: 'forecast' },
    ],
  },
  {
    keywords: ['help', 'how', 'what', 'where', 'guide', 'tutorial', 'learn'],
    response: 'I can help you navigate the app! Just ask about any feature like tasks, expenses, flocks, or sales, and I\'ll guide you there.',
    buttons: [
      { label: 'Dashboard', route: 'dashboard' },
      { label: 'Tasks', route: 'tasks' },
      { label: 'Flocks', route: 'flocks' },
      { label: 'Inventory', route: 'inventory' },
    ],
  },
];

const DEFAULT_RESPONSE = {
  response: 'I\'m not sure what you\'re looking for. Here are some common actions you might want:',
  buttons: [
    { label: 'Dashboard', route: 'dashboard' },
    { label: 'Tasks', route: 'tasks' },
    { label: 'Flocks', route: 'flocks' },
    { label: 'Expenses', route: 'expenses' },
    { label: 'Inventory', route: 'inventory' },
    { label: 'Sales', route: 'sales' },
  ],
};

const QUICK_ACTIONS = [
  { label: 'View Tasks', route: 'tasks', icon: 'CheckSquare' },
  { label: 'Add Expense', route: 'expenses', icon: 'DollarSign' },
  { label: 'View Flocks', route: 'flocks', icon: 'Bird' },
  { label: 'Check Inventory', route: 'inventory', icon: 'Package' },
];

function findBestMatch(input: string): FAQEntry | null {
  const normalizedInput = input.toLowerCase().trim();

  let bestMatch: FAQEntry | null = null;
  let bestScore = 0;

  for (const entry of FAQ_DATABASE) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (normalizedInput.includes(keyword)) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

const IconMap: Record<string, any> = {
  CheckSquare,
  DollarSign,
  Bird,
  Package,
  LayoutDashboard,
  Syringe,
  ShoppingCart,
  Users,
  Calendar,
};

export function HelperAssistant({ onNavigate }: HelperAssistantProps) {
  const { currentFarm } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    const match = findBestMatch(text);
    const response = match || DEFAULT_RESPONSE;

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response.response,
      buttons: response.buttons,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleButtonClick = (route: string) => {
    onNavigate(route);
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    onNavigate(action.route);
  };

  if (!currentFarm) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Please select a farm to use the Helper</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[600px] bg-gray-50">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-[#3D5F42] to-[#2d4631] rounded-xl">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Helper</h1>
            <p className="text-sm text-gray-500">Navigate your farm with quick tips</p>
          </div>
        </div>

        {messages.length === 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Quick actions</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action, idx) => {
                const Icon = IconMap[action.icon] || ChevronRight;
                return (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-[#3D5F42]/10 rounded-full mb-4">
              <HelpCircle className="w-10 h-10 text-[#3D5F42]" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              How can I help you?
            </h2>
            <p className="text-gray-500 max-w-md mb-4">
              Ask me about tasks, expenses, flocks, inventory, or any other feature. I'll help you navigate to the right place.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['How do I add an expense?', 'Where are my tasks?', 'Show me flocks'].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(suggestion)}
                  className="px-3 py-1.5 text-sm bg-white border border-gray-200 hover:border-[#3D5F42] text-gray-700 rounded-full transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 bg-[#3D5F42] rounded-lg flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
              <div
                className={`rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-[#3D5F42] text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>

              {message.buttons && message.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {message.buttons.map((button, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleButtonClick(button.route)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#3D5F42] bg-[#3D5F42]/10 hover:bg-[#3D5F42]/20 rounded-lg transition-colors"
                    >
                      {button.label}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about tasks, expenses, flocks..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="flex-shrink-0 p-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4631] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Works offline - no internet required
        </p>
      </div>
    </div>
  );
}
