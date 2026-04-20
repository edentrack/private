import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, Image, Table, X, ChevronDown, Sparkles, Lock, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { ProposedImportReview } from './ProposedImportReview';
import { CSVMappingFlow } from './CSVMappingFlow';

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  storagePath?: string;
  error?: string;
}

interface Flock {
  id: string;
  name: string;
  purpose: string;
}

type ImportScope = 'farm' | 'existing_flock' | 'new_flock';

export function SmartUploadPage() {
  const { profile } = useAuth();
  const farmId = profile?.farm_id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [scope, setScope] = useState<ImportScope>('farm');
  const [targetFlockId, setTargetFlockId] = useState<string>('');
  const [useAI, setUseAI] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showCSVMapping, setShowCSVMapping] = useState(false);
  const [csvFile, setCsvFile] = useState<UploadedFile | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (farmId) {
      loadFlocks();
      checkAIStatus();
    }
  }, [farmId]);

  async function loadFlocks() {
    const { data } = await supabase
      .from('flocks')
      .select('id, name, purpose')
      .eq('farm_id', farmId)
      .eq('is_archived', false)
      .order('name');
    if (data) setFlocks(data);
  }

  async function checkAIStatus() {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-import/health`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const result = await response.json();
      setAiConfigured(result.aiConfigured ?? false);
      if (!result.aiConfigured) setUseAI(false);
    } catch {
      setAiConfigured(false);
      setUseAI(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  function addFiles(newFiles: File[]) {
    const validTypes = [
      'application/pdf',
      'image/png', 'image/jpeg', 'image/webp', 'image/heic',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const validFiles = newFiles.filter(f => validTypes.includes(f.type) || f.name.endsWith('.csv') || f.name.endsWith('.xlsx'));

    const uploadedFiles: UploadedFile[] = validFiles.map(file => ({
      file,
      id: crypto.randomUUID(),
      status: 'pending' as const,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setFiles(prev => [...prev, ...uploadedFiles]);
  }

  function removeFile(id: string) {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  }

  function getFileIcon(file: File) {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
    if (file.type === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
    return <Table className="w-5 h-5 text-green-500" />;
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleAnalyze() {
    if (files.length === 0) {
      setError('Please upload at least one file');
      return;
    }

    setError(null);
    setAnalyzing(true);

    try {
      const { data: importData, error: importError } = await supabase
        .from('imports')
        .insert({
          farm_id: farmId,
          created_by: profile?.id,
          scope,
          target_flock_id: scope === 'existing_flock' ? targetFlockId : null,
          ai_enabled: useAI,
          status: 'draft',
        })
        .select()
        .single();

      if (importError) throw importError;
      setCurrentImportId(importData.id);

      const uploadedFileIds: string[] = [];

      for (const uploadFile of files) {
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading' as const } : f
        ));

        const fileHash = await computeFileHash(uploadFile.file);
        const storagePath = `farm/${farmId}/imports/${importData.id}/${fileHash}_${uploadFile.file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('imports')
          .upload(storagePath, uploadFile.file);

        if (uploadError) {
          setFiles(prev => prev.map(f =>
            f.id === uploadFile.id ? { ...f, status: 'error' as const, error: uploadError.message } : f
          ));
          continue;
        }

        const { data: fileRecord, error: fileError } = await supabase
          .from('import_files')
          .insert({
            import_id: importData.id,
            farm_id: farmId,
            storage_path: storagePath,
            file_name: uploadFile.file.name,
            mime_type: uploadFile.file.type,
            file_size: uploadFile.file.size,
            file_hash: fileHash,
          })
          .select()
          .single();

        if (fileError) {
          setFiles(prev => prev.map(f =>
            f.id === uploadFile.id ? { ...f, status: 'error' as const, error: fileError.message } : f
          ));
          continue;
        }

        uploadedFileIds.push(fileRecord.id);
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploaded' as const, storagePath } : f
        ));
      }

      const csvFiles = files.filter(f =>
        f.file.type === 'text/csv' ||
        f.file.name.endsWith('.csv') ||
        f.file.name.endsWith('.xlsx') ||
        f.file.type.includes('spreadsheet')
      );

      if (csvFiles.length > 0 && !useAI) {
        setCsvFile(csvFiles[0]);
        setShowCSVMapping(true);
        setAnalyzing(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-import/analyze`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            import_id: importData.id,
            file_ids: uploadedFileIds,
            scope,
            target_flock_id: scope === 'existing_flock' ? targetFlockId : null,
            use_ai: useAI,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      await supabase
        .from('imports')
        .update({ status: 'ready' })
        .eq('id', importData.id);

      setShowReview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze files');
    } finally {
      setAnalyzing(false);
    }
  }

  async function computeFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  function handleCSVMappingComplete() {
    setShowCSVMapping(false);
    setShowReview(true);
  }

  function handleReviewComplete() {
    setShowReview(false);
    setFiles([]);
    setCurrentImportId(null);
    setScope('farm');
    setTargetFlockId('');
  }

  if (showCSVMapping && csvFile && currentImportId) {
    return (
      <CSVMappingFlow
        file={csvFile.file}
        importId={currentImportId}
        farmId={farmId!}
        scope={scope}
        targetFlockId={scope === 'existing_flock' ? targetFlockId : undefined}
        onComplete={handleCSVMappingComplete}
        onCancel={() => setShowCSVMapping(false)}
      />
    );
  }

  if (showReview && currentImportId) {
    return (
      <ProposedImportReview
        importId={currentImportId}
        farmId={farmId!}
        onComplete={handleReviewComplete}
        onCancel={() => {
          setShowReview(false);
          setCurrentImportId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Smart Upload</h1>
        <p className="text-gray-600 mt-1">
          Upload farm documents, receipts, or spreadsheets to automatically extract and import data
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-[#3D5F42] bg-[#3D5F42]/5'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.xlsx,.xls"
            onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
            className="hidden"
          />
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-[#3D5F42]' : 'text-gray-400'}`} />
          <p className="text-lg font-medium text-gray-900 mb-1">
            Drop files here or click to upload
          </p>
          <p className="text-sm text-gray-500">
            PDF, Images (PNG, JPG), CSV, or Excel files up to 50MB
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map(f => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                {f.preview ? (
                  <img src={f.preview} alt="" className="w-10 h-10 object-cover rounded" />
                ) : (
                  getFileIcon(f.file)
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{f.file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(f.file.size)}</p>
                </div>
                {f.status === 'uploading' && (
                  <Loader2 className="w-5 h-5 text-[#3D5F42] animate-spin" />
                )}
                {f.status === 'uploaded' && (
                  <span className="text-xs text-green-600 font-medium">Uploaded</span>
                )}
                {f.status === 'error' && (
                  <span className="text-xs text-red-600 font-medium">{f.error}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.id);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Import Scope
            </label>
            <div className="relative">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as ImportScope)}
                className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
              >
                <option value="farm">General Farm Import</option>
                <option value="existing_flock">Import into Existing Flock</option>
                <option value="new_flock">Create New Flock from Document</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {scope === 'existing_flock' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Flock
              </label>
              <div className="relative">
                <select
                  value={targetFlockId}
                  onChange={(e) => setTargetFlockId(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent"
                >
                  <option value="">Select a flock...</option>
                  {flocks.map(flock => (
                    <option key={flock.id} value={flock.id}>
                      {flock.name} ({flock.purpose})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              {aiConfigured ? (
                <Sparkles className="w-5 h-5 text-amber-500" />
              ) : (
                <Lock className="w-5 h-5 text-gray-400" />
              )}
              <div>
                <p className="font-medium text-gray-900">AI-Powered Extraction</p>
                <p className="text-sm text-gray-500">
                  {aiConfigured
                    ? 'Automatically extract structured data from documents'
                    : 'AI extraction is not configured. CSV mapping available.'}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                disabled={!aiConfigured}
                className="sr-only peer"
              />
              <div className={`w-11 h-6 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#3D5F42] transition-colors ${
                useAI && aiConfigured ? 'bg-[#3D5F42]' : 'bg-gray-300'
              } ${!aiConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform ${
                  useAI && aiConfigured ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            setFiles([]);
            setError(null);
          }}
          className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleAnalyze}
          disabled={files.length === 0 || analyzing || (scope === 'existing_flock' && !targetFlockId)}
          className="px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Analyze Upload
            </>
          )}
        </button>
      </div>
    </div>
  );
}
