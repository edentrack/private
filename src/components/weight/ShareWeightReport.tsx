import { useState, useEffect } from 'react';
import { Share2, Copy, MessageSquare, Check, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';
import { WeightAnalysisResult } from '../../utils/weightAnalysis';
import { formatWeightReportForWhatsApp, shareViaWhatsApp, shareViaSMS, copyToClipboard } from '../../utils/whatsappShare';

interface ShareWeightReportProps {
  flock: Flock;
  results: WeightAnalysisResult;
  farmName: string;
}

interface TeamContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  can_receive_reports: boolean;
}

export function ShareWeightReport({ flock, results, farmName }: ShareWeightReportProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTeamContacts();
  }, []);

  const loadTeamContacts = async () => {
    if (!user || !flock.farm_id) return;

    const { data } = await supabase
      .from('team_contacts')
      .select('*')
      .eq('farm_id', flock.farm_id)
      .eq('can_receive_reports', true)
      .order('name');

    if (data) {
      setContacts(data);
    }
  };

  const message = formatWeightReportForWhatsApp(
    results,
    flock,
    { name: farmName, id: flock.farm_id }
  );

  const handleWhatsAppShare = () => {
    shareViaWhatsApp(message);
  };

  const handleShareToContact = (phoneNumber: string) => {
    shareViaWhatsApp(message, phoneNumber);
    setShowContactPicker(false);
  };

  const handleSMSShare = () => {
    shareViaSMS(message);
  };

  const handleCopy = async () => {
    try {
      await copyToClipboard(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-3xl p-6 border-2 border-green-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
          <Share2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Share Report</h3>
          <p className="text-sm text-gray-600">Share this weight analysis with your team</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={handleWhatsAppShare}
          className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl font-medium hover:bg-green-700 transition-all shadow-md hover:shadow-lg"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          Share on WhatsApp
        </button>

        <div className="relative">
          <button
            onClick={() => setShowContactPicker(!showContactPicker)}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-green-600 text-green-700 px-4 py-3 rounded-xl font-medium hover:bg-green-50 transition-all"
          >
            <MessageSquare className="w-5 h-5" />
            Send to Team
            <ChevronDown className={`w-4 h-4 transition-transform ${showContactPicker ? 'rotate-180' : ''}`} />
          </button>

          {showContactPicker && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-lg z-10 max-h-64 overflow-y-auto">
              {contacts.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-gray-600 mb-2">No team contacts saved</p>
                  <p className="text-xs text-gray-500">Add contacts in Settings</p>
                </div>
              ) : (
                <div className="py-2">
                  {contacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => handleShareToContact(contact.phone)}
                      className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{contact.name}</p>
                        <p className="text-xs text-gray-500">{contact.role}</p>
                      </div>
                      <svg className="w-5 h-5 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 bg-white border-2 border-gray-300 text-gray-700 px-4 py-3 rounded-xl font-medium hover:bg-gray-50 transition-all"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              Copy Report
            </>
          )}
        </button>
      </div>

      <div className="mt-4 pt-4 border-t-2 border-green-200">
        <button
          onClick={handleSMSShare}
          className="text-sm text-green-700 hover:text-green-800 font-medium flex items-center gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          Or send via SMS
        </button>
      </div>
    </div>
  );
}
