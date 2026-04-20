import { useState, useEffect } from 'react';
import { ChevronDown, ArrowRight, AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Props {
  file: File;
  importId: string;
  farmId: string;
  scope: string;
  targetFlockId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

type EntityType = 'expense' | 'inventory' | 'production';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
}

const ENTITY_FIELDS: Record<EntityType, { key: string; label: string; required?: boolean }[]> = {
  expense: [
    { key: 'incurred_on', label: 'Date', required: true },
    { key: 'category', label: 'Category', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'currency', label: 'Currency' },
    { key: 'description', label: 'Description' },
    { key: 'vendor', label: 'Vendor' },
  ],
  inventory: [
    { key: 'item_name', label: 'Item Name', required: true },
    { key: 'quantity', label: 'Quantity', required: true },
    { key: 'unit', label: 'Unit' },
    { key: 'purchased_on', label: 'Date' },
    { key: 'cost', label: 'Cost' },
    { key: 'currency', label: 'Currency' },
    { key: 'inventory_type', label: 'Type (feed/other)' },
  ],
  production: [
    { key: 'log_type', label: 'Log Type', required: true },
    { key: 'logged_on', label: 'Date', required: true },
    { key: 'value', label: 'Value', required: true },
    { key: 'unit', label: 'Unit' },
    { key: 'notes', label: 'Notes' },
  ],
};

const CATEGORY_OPTIONS = ['feed', 'medication', 'equipment', 'labor', 'chicks purchase', 'transport', 'other'];
const LOG_TYPE_OPTIONS = ['mortality', 'weight', 'egg_count', 'feed_usage', 'water_intake', 'notes'];

export function CSVMappingFlow({ file, importId, farmId, scope, targetFlockId, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<'type' | 'mapping' | 'preview' | 'processing'>('type');
  const [entityType, setEntityType] = useState<EntityType>('expense');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    parseFile();
  }, [file]);

  async function parseFile() {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      if (lines.length === 0) {
        setError('File is empty');
        return;
      }

      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const parsedRows = lines.map(line => parseCSVLine(line, delimiter));

      setHeaders(parsedRows[0]);
      setRows(parsedRows.slice(1));

      const initialMappings: ColumnMapping[] = parsedRows[0].map(col => ({
        sourceColumn: col,
        targetField: guessFieldMapping(col, entityType),
      }));
      setMappings(initialMappings);
    } catch (err) {
      setError('Failed to parse file');
    }
  }

  function parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  function guessFieldMapping(column: string, type: EntityType): string {
    const col = column.toLowerCase();
    const fields = ENTITY_FIELDS[type];

    if (col.includes('date') || col.includes('time')) {
      const dateField = fields.find(f => f.key.includes('_on') || f.key.includes('date'));
      return dateField?.key || '';
    }
    if (col.includes('amount') || col.includes('total') || col.includes('price') || col.includes('cost')) {
      const amountField = fields.find(f => f.key === 'amount' || f.key === 'cost' || f.key === 'value');
      return amountField?.key || '';
    }
    if (col.includes('category') || col.includes('type')) {
      const catField = fields.find(f => f.key === 'category' || f.key === 'log_type' || f.key === 'inventory_type');
      return catField?.key || '';
    }
    if (col.includes('description') || col.includes('note') || col.includes('memo')) {
      const descField = fields.find(f => f.key === 'description' || f.key === 'notes');
      return descField?.key || '';
    }
    if (col.includes('vendor') || col.includes('supplier')) {
      return 'vendor';
    }
    if (col.includes('item') || col.includes('name') || col.includes('product')) {
      return 'item_name';
    }
    if (col.includes('qty') || col.includes('quantity') || col.includes('count')) {
      const qtyField = fields.find(f => f.key === 'quantity' || f.key === 'value');
      return qtyField?.key || '';
    }
    if (col.includes('unit')) {
      return 'unit';
    }
    if (col.includes('currency') || col === 'ccy') {
      return 'currency';
    }

    return '';
  }

  function updateMapping(sourceColumn: string, targetField: string) {
    setMappings(prev =>
      prev.map(m =>
        m.sourceColumn === sourceColumn ? { ...m, targetField } : m
      )
    );
  }

  function getMappedValue(row: string[], fieldKey: string): string | undefined {
    const mapping = mappings.find(m => m.targetField === fieldKey);
    if (!mapping) return undefined;
    const colIndex = headers.indexOf(mapping.sourceColumn);
    if (colIndex === -1) return undefined;
    return row[colIndex];
  }

  function validateMappings(): string[] {
    const errors: string[] = [];
    const requiredFields = ENTITY_FIELDS[entityType].filter(f => f.required);

    for (const field of requiredFields) {
      const hasMapping = mappings.some(m => m.targetField === field.key);
      if (!hasMapping) {
        errors.push(`Missing required mapping for: ${field.label}`);
      }
    }

    return errors;
  }

  async function handleProcess() {
    const validationErrors = validateMappings();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const items = rows.map(row => {
        const payload: Record<string, any> = {};

        for (const field of ENTITY_FIELDS[entityType]) {
          const value = getMappedValue(row, field.key);
          if (value !== undefined && value !== '') {
            if (field.key === 'amount' || field.key === 'cost' || field.key === 'value' || field.key === 'quantity') {
              payload[field.key] = parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
            } else {
              payload[field.key] = value;
            }
          }
        }

        if (!payload.currency && (entityType === 'expense' || entityType === 'inventory')) {
          payload.currency = 'XAF';
        }

        return {
          import_id: importId,
          farm_id: farmId,
          entity_type: entityType,
          payload,
          confidence: 0.9,
          needs_review: false,
          status: 'proposed',
          linked_flock_id: targetFlockId || null,
        };
      }).filter(item => {
        const required = ENTITY_FIELDS[entityType].filter(f => f.required);
        return required.every(f => item.payload[f.key] !== undefined && item.payload[f.key] !== '');
      });

      if (items.length === 0) {
        setError('No valid rows found after applying mappings');
        setProcessing(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('import_items')
        .insert(items);

      if (insertError) throw insertError;

      await supabase
        .from('imports')
        .update({ status: 'ready' })
        .eq('id', importId);

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setProcessing(false);
    }
  }

  if (step === 'type') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CSV Import</h1>
          <p className="text-gray-600 mt-1">
            Map your spreadsheet columns to farm data fields
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">What type of data is this?</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['expense', 'inventory', 'production'] as EntityType[]).map(type => (
              <button
                key={type}
                onClick={() => {
                  setEntityType(type);
                  setMappings(headers.map(col => ({
                    sourceColumn: col,
                    targetField: guessFieldMapping(col, type),
                  })));
                  setStep('mapping');
                }}
                className={`p-6 border-2 rounded-xl text-left transition-all hover:border-[#3D5F42] hover:bg-[#3D5F42]/5 ${
                  entityType === type ? 'border-[#3D5F42] bg-[#3D5F42]/5' : 'border-gray-200'
                }`}
              >
                <h3 className="font-semibold text-gray-900 capitalize mb-2">{type === 'production' ? 'Production Logs' : type + 's'}</h3>
                <p className="text-sm text-gray-500">
                  {type === 'expense' && 'Receipts, invoices, purchase records'}
                  {type === 'inventory' && 'Feed stock, supplies, equipment'}
                  {type === 'production' && 'Mortality, weights, egg counts, feed usage'}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === 'mapping') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Map Columns</h1>
          <p className="text-gray-600 mt-1">
            Match your spreadsheet columns to {entityType} fields
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="space-y-4">
            {headers.map(header => (
              <div key={header} className="flex items-center gap-4">
                <div className="w-1/3">
                  <span className="text-sm font-medium text-gray-900 bg-gray-100 px-3 py-2 rounded-lg block truncate">
                    {header}
                  </span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="w-1/3 relative">
                  <select
                    value={mappings.find(m => m.sourceColumn === header)?.targetField || ''}
                    onChange={(e) => updateMapping(header, e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
                  >
                    <option value="">-- Skip this column --</option>
                    {ENTITY_FIELDS[entityType].map(field => (
                      <option key={field.key} value={field.key}>
                        {field.label} {field.required ? '*' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="w-1/3 text-sm text-gray-500 truncate">
                  Sample: {rows[0]?.[headers.indexOf(header)] || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={() => setStep('type')}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={() => {
              const errors = validateMappings();
              if (errors.length > 0) {
                setError(errors.join(', '));
                return;
              }
              setError(null);
              setStep('preview');
            }}
            className="px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631]"
          >
            Preview Data
          </button>
        </div>
      </div>
    );
  }

  if (step === 'preview') {
    const previewRows = rows.slice(0, 10);
    const activeFields = ENTITY_FIELDS[entityType].filter(f =>
      mappings.some(m => m.targetField === f.key)
    );

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preview Import</h1>
          <p className="text-gray-600 mt-1">
            Review the first {Math.min(10, rows.length)} of {rows.length} rows before importing
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  {activeFields.map(field => (
                    <th key={field.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {previewRows.map((row, idx) => (
                  <tr key={idx}>
                    {activeFields.map(field => (
                      <td key={field.key} className="px-4 py-3 text-sm">
                        {getMappedValue(row, field.key) || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={() => setStep('mapping')}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleProcess}
            disabled={processing}
            className="px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631] disabled:opacity-50 flex items-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Import {rows.length} Rows
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
