import { useState } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  onClose: () => void;
  onCreated: (cooperativeId: string) => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function CreateCooperativeModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const slugTouched = slug !== '' && slug !== slugify(name);
  const finalSlug = slugTouched ? slug : slugify(name);

  const submit = async () => {
    if (!user) return;
    if (!name.trim()) {
      showToast(isFr ? 'Le nom est requis' : 'Name is required', 'error');
      return;
    }
    if (!finalSlug) {
      showToast(isFr ? 'Le slug est requis' : 'Slug is required', 'error');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from('cooperatives')
      .insert({
        name: name.trim(),
        slug: finalSlug,
        country: country.trim() || null,
        region: region.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        description: description.trim() || null,
        owner_user_id: user.id,
      })
      .select('id')
      .single();
    setSubmitting(false);
    if (error) {
      const msg = error.message.includes('cooperatives_slug_key')
        ? (isFr ? 'Ce slug est déjà utilisé. Choisissez-en un autre.' : 'That slug is already taken. Pick another.')
        : (isFr ? `Échec de la création : ${error.message}` : `Failed to create: ${error.message}`);
      showToast(msg, 'error');
      return;
    }
    showToast(isFr ? 'Coopérative créée. Vous êtes le premier administrateur.' : 'Cooperative created. You are the first admin.', 'success');
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">{isFr ? 'Créer une coopérative' : 'Create cooperative'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            {isFr
              ? 'Une coopérative est une organisation mère (ONG, fédération, union laitière, réseau d\'écloseries) avec de nombreuses fermes membres. Vous serez le premier administrateur - invitez-en d\'autres ensuite.'
              : 'A cooperative is a parent organisation (NGO, federation, dairy union, hatchery network) with many member farms under it. You\'ll be the first admin - invite more after.'}
          </p>

          <Field label={isFr ? 'Nom de la coopérative' : 'Cooperative name'} required>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder={isFr ? 'ex. Union des éleveurs de poissons-chats du Kwara' : 'e.g. Kwara Catfish Farmers Union'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={submitting}
            />
          </Field>

          <Field label={isFr ? 'Slug URL' : 'URL slug'} required hint={isFr ? 'Minuscules, tirets uniquement. Utilisé pour les pages publiques de la coopérative.' : 'Lowercase, hyphens only. Used for public co-op pages.'}>
            <input
              value={finalSlug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="kwara-catfish"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              disabled={submitting}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={isFr ? 'Pays' : 'Country'}>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={isFr ? 'Nigéria' : 'Nigeria'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={submitting}
              />
            </Field>
            <Field label={isFr ? 'Région / état' : 'Region / state'}>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Kwara"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={submitting}
              />
            </Field>
          </div>

          <Field label={isFr ? 'Email de contact' : 'Contact email'}>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="admin@coop.org"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={submitting}
            />
          </Field>

          <Field label={isFr ? 'Téléphone de contact' : 'Contact phone'}>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+234 …"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={submitting}
            />
          </Field>

          <Field label={isFr ? 'Description' : 'Description'}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isFr ? 'Ce que fait cette coopérative et qui elle sert.' : 'What this cooperative does and who it serves.'}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              disabled={submitting}
            />
          </Field>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            {isFr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim() || !finalSlug}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isFr ? 'Créer' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-800 block mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-gray-500 block mt-1">{hint}</span>}
    </label>
  );
}
