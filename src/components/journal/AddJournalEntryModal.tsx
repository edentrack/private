import { useState } from 'react';
import { X, Check, EyeOff, Star, ImagePlus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logNote, type NoteType, type AuthorRole } from '../../lib/journalLogger';

interface Props {
  farmId: string;
  flockId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Manual journal note composer.
 *
 * Phase 1: text-only. Type, title, body, private, important.
 * Phase 2: photo upload (via Capacitor camera on native, file picker
 * on web). The schema already supports photo_urls[].
 * Phase 3: @mentions of team members trigger push notifications.
 *
 * Keeps the form lean — the most common case is "owner jots a quick
 * note", not a structured entry. Title is optional, body is required,
 * type defaults to Observation.
 */
export function AddJournalEntryModal({ farmId, flockId, onClose, onSaved }: Props) {
  const { currentRole } = useAuth();
  const toast = useToast();
  const [entryType, setEntryType] = useState<NoteType>('observation');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  // Photo upload state. We stage files locally, upload on Save, and
  // attach the resulting public URLs to the journal_entries.photo_urls
  // array. Reusing the existing `inventory-photos` bucket so we don't
  // need a new storage policy.
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const actorRole: AuthorRole =
    (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'worker')
      ? currentRole
      : 'worker';

  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const safe = files.filter(f => acceptedTypes.includes(f.type) && f.size < 8 * 1024 * 1024);
    if (safe.length !== files.length) {
      toast.error('Some files were skipped (JPEG/PNG/WebP under 8MB only).');
    }
    setPhotoFiles(prev => [...prev, ...safe].slice(0, 6));
    setPhotoPreviews(prev => [...prev, ...safe.map(f => URL.createObjectURL(f))].slice(0, 6));
    // Reset so picking the same file again still triggers onChange
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (!photoFiles.length) return [];
    setUploadingPhotos(true);
    const urls: string[] = [];
    try {
      for (const file of photoFiles) {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${farmId}/journal/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('inventory-photos')
          .upload(path, file, { contentType: file.type });
        if (uploadErr) {
          console.warn('[journal] photo upload failed:', uploadErr);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from('inventory-photos')
          .getPublicUrl(path);
        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      }
    } finally {
      setUploadingPhotos(false);
    }
    return urls;
  };

  const handleSave = async () => {
    if (!body.trim()) {
      toast.error('Write a note before saving');
      return;
    }
    setSaving(true);
    try {
      // Upload any staged photos first. If upload fails for a file
      // we skip it but keep going — the user can still save the note.
      const photoUrls = await uploadPhotos();

      const id = await logNote({
        farmId,
        flockId,
        entryType,
        title: title.trim() || undefined,
        body: body.trim(),
        photoUrls,
        isPrivate,
        isImportant,
        actorRole,
      });
      if (!id) {
        toast.error('Could not save the note. Try again.');
        return;
      }
      toast.success('Note saved');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Write a note</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Type selector — defaults to Observation. The full list lets
              owners separate financial notes from personal reminders so
              the journal stays useful when it grows past 100 entries. */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
            <select
              value={entryType}
              onChange={e => setEntryType(e.target.value as NoteType)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
            >
              <option value="observation">👀 Observation (what you noticed)</option>
              <option value="health">🩺 Health (vet / disease / vaccine)</option>
              <option value="financial">💰 Financial (P&L / cash flow)</option>
              <option value="milestone">🏆 Milestone (cycle close-out, target hit)</option>
              <option value="personal">📝 Personal (reminder / TODO)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Title <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="One-line summary..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              placeholder="What did you see? What needs to happen?"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] resize-none"
            />
          </div>

          {/* Photos — up to 6, JPEG/PNG/WebP under 8MB each. Stored
              under inventory-photos/{farmId}/journal/. */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Photos <span className="text-gray-400 font-normal">(optional, up to 6)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {photoPreviews.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photoFiles.length < 6 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors">
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px] mt-0.5">Add</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePickPhotos}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Flags — keep these out of the way for fast entry */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={e => setIsPrivate(e.target.checked)}
                className="w-4 h-4"
              />
              <EyeOff className="w-4 h-4 text-gray-500" />
              <div>
                <div className="text-xs font-semibold text-gray-900">Private</div>
                <div className="text-[10px] text-gray-500">Only you and the farm owner can see this note.</div>
              </div>
            </label>

            {actorRole === 'owner' && (
              <label className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={e => setIsImportant(e.target.checked)}
                  className="w-4 h-4"
                />
                <Star className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="text-xs font-semibold text-gray-900">Important</div>
                  <div className="text-[10px] text-gray-500">Highlights the note with an amber border for review.</div>
                </div>
              </label>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || uploadingPhotos || !body.trim()}
            className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving || uploadingPhotos ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {uploadingPhotos ? 'Uploading photos…' : 'Saving…'}</>
            ) : (
              <><Check className="w-4 h-4" /> Save note</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
