import { useEffect, useMemo, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { ConfirmEggCollectionModal } from './ConfirmEggCollectionModal';

type EggSize = 'small' | 'medium' | 'large' | 'jumbo';

interface LogCollectionModalProps {
  flockId: string;
  onClose: () => void;
  onSuccess: () => void;
  createTaskRecord?: boolean;
}

export function LogCollectionModal({ flockId, onClose, onSuccess, createTaskRecord = false }: LogCollectionModalProps) {
  const { user, currentFarm } = useAuth();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [traysBySize, setTraysBySize] = useState({ small: '', medium: '', large: '', jumbo: '' });
  const [looseBySize, setLooseBySize] = useState({ small: '', medium: '', large: '', jumbo: '' });
  const [eggsBroken, setEggsBroken] = useState('0');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!currentFarm?.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('farms')
          .select('eggs_per_tray')
          .eq('id', currentFarm.id)
          .single();
        if (data?.eggs_per_tray) setEggsPerTray(data.eggs_per_tray);
      } catch {
        // ignore
      }
    })();
  }, [currentFarm?.id]);

  const liveTotals = useMemo(() => {
    const traysNums = {
      small: Number(traysBySize.small) || 0,
      medium: Number(traysBySize.medium) || 0,
      large: Number(traysBySize.large) || 0,
      jumbo: Number(traysBySize.jumbo) || 0,
    };
    const looseNums = {
      small: Number(looseBySize.small) || 0,
      medium: Number(looseBySize.medium) || 0,
      large: Number(looseBySize.large) || 0,
      jumbo: Number(looseBySize.jumbo) || 0,
    };
    const totals = {
      small: Math.round(traysNums.small * eggsPerTray + looseNums.small),
      medium: Math.round(traysNums.medium * eggsPerTray + looseNums.medium),
      large: Math.round(traysNums.large * eggsPerTray + looseNums.large),
      jumbo: Math.round(traysNums.jumbo * eggsPerTray + looseNums.jumbo),
    };
    const totalGood = totals.small + totals.medium + totals.large + totals.jumbo;
    const totalLoose = looseNums.small + looseNums.medium + looseNums.large + looseNums.jumbo;
    const totalTraysCount = traysNums.small + traysNums.medium + traysNums.large + traysNums.jumbo;
    return { traysNums, looseNums, totals, totalGood, totalLoose, totalTraysCount };
  }, [traysBySize, looseBySize, eggsPerTray]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) return;

    const brokenNum = parseFloat(eggsBroken) || 0;

    if (liveTotals.totalGood === 0 && brokenNum === 0) {
      setError('Please enter at least some eggs collected');
      return;
    }

    const badLoose = (Object.values(liveTotals.looseNums) as number[]).some((v) => v >= eggsPerTray);
    if (badLoose) {
      setError(`Loose eggs for each size must be less than ${eggsPerTray}.`);
      return;
    }

    setError('');
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    if (!user || !currentFarm?.id) return;
    setShowConfirm(false);
    setLoading(true);

    try {
      let photoUrl = null;

      if (photo) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${currentFarm.id}/${flockId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('inventory-photos')
          .upload(fileName, photo);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('inventory-photos')
          .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;
      }

      const sizeTotals: Record<EggSize, number> = {
        small: liveTotals.totals.small,
        medium: liveTotals.totals.medium,
        large: liveTotals.totals.large,
        jumbo: liveTotals.totals.jumbo,
      };

      const traysForRecord = Math.round(liveTotals.totalTraysCount) + (liveTotals.totalLoose > 0 ? 1 : 0);

      const { error: insertError } = await supabase.from('egg_collections').insert({
        farm_id: currentFarm.id,
        flock_id: flockId,
        collection_date: date,
        collected_on: date,
        trays: traysForRecord,
        broken: Math.round(brokenNum),
        small_eggs: sizeTotals.small,
        medium_eggs: sizeTotals.medium,
        large_eggs: sizeTotals.large,
        jumbo_eggs: sizeTotals.jumbo,
        damaged_eggs: Math.round(brokenNum),
        total_eggs: liveTotals.totalGood,
        notes: notes || null,
        photo_url: photoUrl,
        created_by: user.id,
      });

      if (insertError) throw insertError;

      // Keep egg_inventory in sync (good eggs only).
      const { data: inv } = await supabase
        .from('egg_inventory')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .maybeSingle();

      if (inv) {
        await supabase
          .from('egg_inventory')
          .update({
            small_eggs: (inv.small_eggs ?? 0) + sizeTotals.small,
            medium_eggs: (inv.medium_eggs ?? 0) + sizeTotals.medium,
            large_eggs: (inv.large_eggs ?? 0) + sizeTotals.large,
            jumbo_eggs: (inv.jumbo_eggs ?? 0) + sizeTotals.jumbo,
            last_updated: new Date().toISOString(),
          })
          .eq('farm_id', currentFarm.id);
      } else {
        await supabase.from('egg_inventory').insert({
          farm_id: currentFarm.id,
          small_eggs: sizeTotals.small,
          medium_eggs: sizeTotals.medium,
          large_eggs: sizeTotals.large,
          jumbo_eggs: sizeTotals.jumbo,
          last_updated: new Date().toISOString(),
        });
      }

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action: `Logged egg collection`,
        entity_type: 'egg_collection',
        entity_id: flockId,
        details: {
          traysBySize: liveTotals.traysNums,
          looseBySize: liveTotals.looseNums,
          totalsBySize: liveTotals.totals,
          broken: brokenNum,
          date,
        },
      });

      if (createTaskRecord) {
        const now = new Date();
        await supabase.from('tasks').insert({
          user_id: user.id,
          farm_id: currentFarm.id,
          flock_id: flockId,
          title: "Log today's egg collection",
          description: `Logged egg collection${brokenNum > 0 ? `, ${brokenNum} broken eggs` : ''}. ${notes ? `Notes: ${notes}` : ''}`,
          due_date: now.toISOString().split('T')[0],
          due_at: now.toISOString(),
          status: 'completed',
          completed: true,
          completed_at: now.toISOString(),
          created_by: user.id,
        });
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <ConfirmEggCollectionModal
      isOpen={showConfirm}
      totals={liveTotals.totals}
      totalGood={liveTotals.totalGood}
      damaged={Math.round(parseFloat(eggsBroken) || 0)}
      onConfirm={handleConfirmedSave}
      onCancel={() => setShowConfirm(false)}
    />
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Log Egg Collection</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
              required
            />
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-50 text-xs font-semibold text-gray-700">
              <div className="px-3 py-2">Size</div>
              <div className="px-3 py-2 text-center">Trays</div>
              <div className="px-3 py-2 text-center">Loose</div>
            </div>
            {([
              { key: 'small', label: 'Small' },
              { key: 'medium', label: 'Medium' },
              { key: 'large', label: 'Large' },
              { key: 'jumbo', label: 'Jumbo' },
            ] as const).map((row) => (
              <div key={row.key} className="grid grid-cols-3 items-center border-t border-gray-200">
                <div className="px-3 py-2 text-sm font-semibold text-gray-900">{row.label}</div>
                <div className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={traysBySize[row.key]}
                    onChange={(e) => setTraysBySize({ ...traysBySize, [row.key]: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg text-sm text-center"
                  />
                </div>
                <div className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={eggsPerTray - 1}
                    value={looseBySize[row.key]}
                    onChange={(e) => setLooseBySize({ ...looseBySize, [row.key]: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg text-sm text-center"
                  />
                </div>
              </div>
            ))}
            <div className="px-3 py-2 bg-gray-50 text-[11px] text-gray-600">
              Loose eggs must be less than {eggsPerTray} per size.
            </div>
          </div>

          <div>
            <label htmlFor="broken" className="block text-sm font-medium text-gray-700 mb-2">
              Eggs Broken
            </label>
            <input
              id="broken"
              type="number"
              value={eggsBroken}
              onChange={(e) => setEggsBroken(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all text-sm"
              placeholder="0"
            />
          </div>

          <div className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Total good eggs</span>
              <span className="text-sm font-bold text-gray-900">{liveTotals.totalGood}</span>
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all resize-none text-sm"
              placeholder="Any additional notes..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photo (Optional)
            </label>
            <label className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-[#3D5F42] transition-colors cursor-pointer">
              <Camera className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-600">
                {photo ? photo.name : 'Upload photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Logging...' : 'Log Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
