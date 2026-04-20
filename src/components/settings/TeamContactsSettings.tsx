import { useState, useEffect } from 'react';
import { Plus, Trash2, Phone, User, Briefcase, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface TeamContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email?: string;
  can_receive_reports: boolean;
}

export function TeamContactsSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [farmId, setFarmId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    role: '',
    phone: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFarmAndContacts();
  }, [user]);

  const loadFarmAndContacts = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: memberData } = await supabase
        .from('farm_members')
        .select('farm_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (memberData) {
        setFarmId(memberData.farm_id);
        await loadContacts(memberData.farm_id);
      }
    } catch (error) {
      console.error('Error loading farm:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async (farmIdToLoad: string) => {
    const { data } = await supabase
      .from('team_contacts')
      .select('*')
      .eq('farm_id', farmIdToLoad)
      .order('name');

    if (data) {
      setContacts(data);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmId || !newContact.name || !newContact.phone) return;

    setSaving(true);
    try {
      let formattedPhone = newContact.phone.trim();

      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('0')) {
          formattedPhone = '+237' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('237')) {
          formattedPhone = '+' + formattedPhone;
        } else {
          formattedPhone = '+237' + formattedPhone;
        }
      }

      const { data, error } = await supabase
        .from('team_contacts')
        .insert({
          farm_id: farmId,
          name: newContact.name.trim(),
          role: newContact.role.trim() || null,
          phone: formattedPhone,
          email: newContact.email.trim() || null,
          can_receive_reports: true,
        })
        .select()
        .single();

      if (error) throw error;

      setContacts([...contacts, data]);
      setNewContact({ name: '', role: '', phone: '', email: '' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding contact:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm(t('settings.confirm_delete_contact') || 'Are you sure you want to delete this contact?')) return;

    try {
      const { error } = await supabase
        .from('team_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      setContacts(contacts.filter(c => c.id !== contactId));
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  const toggleReportReceiving = async (contactId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('team_contacts')
        .update({ can_receive_reports: !currentValue })
        .eq('id', contactId);

      if (error) throw error;

      setContacts(contacts.map(c =>
        c.id === contactId
          ? { ...c, can_receive_reports: !currentValue }
          : c
      ));
    } catch (error) {
      console.error('Error updating contact:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-8 text-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">{t('settings.loading_team_contacts') || 'Loading team contacts...'}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-4">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('settings.team_contacts') || 'Team Contacts'}</h3>
        <p className="text-gray-600">
          {t('settings.team_contacts_desc') || 'Add team members for quick report sharing via WhatsApp'}
        </p>
      </div>

      {contacts.length > 0 && (
        <div className="space-y-2 mb-4">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className="flex items-center justify-between border-2 border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-gray-400" />
                  <p className="font-medium text-gray-900">{contact.name}</p>
                </div>
                {contact.role && (
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="w-4 h-4 text-gray-400" />
                    <p className="text-sm text-gray-600">{contact.role}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-600">{contact.phone}</p>
                </div>
                {contact.email && (
                  <p className="text-xs text-gray-500 mt-1">{contact.email}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contact.can_receive_reports}
                    onChange={() => toggleReportReceiving(contact.id, contact.can_receive_reports)}
                    className="w-4 h-4 text-[#3D5F42] rounded focus:ring-[#3D5F42]"
                  />
                  <span className="text-sm text-gray-600">{t('settings.reports') || 'Reports'}</span>
                </label>

                <button
                  onClick={() => handleDeleteContact(contact.id)}
                  className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-[#3D5F42] hover:text-[#2F4A34] font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('settings.add_new_contact') || 'Add New Contact'}
        </button>
      )}

      {showAddForm && (
        <div className="border-t-2 border-gray-200 pt-4 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-gray-900">{t('settings.add_new_contact') || 'Add New Contact'}</h4>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewContact({ name: '', role: '', phone: '', email: '' });
              }}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              {t('common.cancel') || 'Cancel'}
            </button>
          </div>

          <form onSubmit={handleAddContact} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.contact_name') || 'Name'} <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder={t('settings.contact_name_placeholder') || 'e.g., John Manager'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all bg-white text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.role_position') || 'Role / Position'}
              </label>
              <input
                type="text"
                value={newContact.role}
                onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                placeholder={t('settings.role_position_placeholder') || 'e.g., Farm Manager, Veterinarian'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all bg-white text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.phone_number') || 'Phone Number'} <span className="text-red-600">*</span>
              </label>
              <input
                type="tel"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder={t('settings.phone_number_placeholder') || '+237XXXXXXXXX or 6XXXXXXXX'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all bg-white text-gray-900"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('settings.phone_number_desc') || "Include country code (e.g., +237 for Cameroon) or we'll add it automatically"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.email_optional') || 'Email (Optional)'}
              </label>
              <input
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                placeholder={t('settings.email_placeholder') || 'contact@example.com'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all bg-white text-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !newContact.name || !newContact.phone}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                saving || !newContact.name || !newContact.phone
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-[#3D5F42] text-white hover:bg-[#2F4A34] shadow-md hover:shadow-lg'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('settings.adding') || 'Adding...'}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {t('settings.add_contact') || 'Add Contact'}
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {contacts.length === 0 && !showAddForm && (
        <div className="text-center py-8">
          <Phone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">{t('settings.no_contacts_yet') || 'No contacts added yet'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {t('settings.add_contacts_desc') || 'Add contacts to quickly share reports via WhatsApp'}
          </p>
        </div>
      )}
    </div>
  );
}
