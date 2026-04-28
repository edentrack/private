import { useState, useEffect } from 'react';
import { TrendingUp, Scale, Target, AlertCircle, DollarSign, Calendar, CheckCircle, Clock, FileText, Download, History } from 'lucide-react';
import { Flock } from '../../types/database';
import { WeightAnalysisResult } from '../../utils/weightAnalysis';
import { CalculationBreakdown } from './CalculationBreakdown';
import { ShareWeightReport } from './ShareWeightReport';
import { supabase } from '../../lib/supabaseClient';

interface WeightCheckResultsProps {
  flock: Flock;
  results: WeightAnalysisResult;
  onNewCheck: () => void;
  onViewHistory?: () => void;
}

export function WeightCheckResults({ flock, results, onNewCheck, onViewHistory }: WeightCheckResultsProps) {
  const isBroiler = flock.type === 'Broiler';
  const isLayer = flock.type === 'Layer';
  const [farmName, setFarmName] = useState('');

  useEffect(() => {
    loadFarmName();
  }, [flock.farm_id]);

  const loadFarmName = async () => {
    if (!flock.farm_id) return;

    const { data } = await supabase
      .from('farms')
      .select('name')
      .eq('id', flock.farm_id)
      .maybeSingle();

    if (data) {
      setFarmName(data.name);
    }
  };

  const getUniformityStars = (rating: string) => {
    if (rating.includes('Excellent')) return '⭐⭐⭐⭐⭐';
    if (rating.includes('Good')) return '⭐⭐⭐⭐';
    if (rating.includes('Fair')) return '⭐⭐⭐';
    return '⭐⭐';
  };

  const handlePDFExport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white border border-gray-200 rounded-2xl flex items-center justify-center">
            <Scale className="w-6 h-6 text-gray-900" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Weight Analysis Results</h2>
            <p className="text-gray-600">{flock.name} - {flock.type}</p>
          </div>
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 mb-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-gray-600">Current Age</div>
              <div className="text-2xl font-bold text-gray-900">Week {results.currentWeek}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Average Weight</div>
              <div className="text-2xl font-bold text-gray-900">{results.average.toFixed(2)} kg</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Target for Week {results.currentWeek}</div>
              <div className="text-2xl font-bold text-gray-900">{results.targetWeight.toFixed(2)} kg</div>
            </div>
          </div>
        </div>

        <div className={`border-l-4 p-4 mb-4 rounded ${
          results.statusColor === 'green' ? 'border-green-500 bg-green-50' :
          results.statusColor === 'yellow' ? 'border-yellow-500 bg-yellow-50' :
          results.statusColor === 'orange' ? 'border-orange-500 bg-orange-50' :
          'border-red-500 bg-red-50'
        }`}>
          <p className="font-bold text-lg mb-2">{results.growthStatus}</p>
          <p className="text-sm text-gray-700">
            Your birds are at {results.percentOfTarget.toFixed(1)}% of target weight for Week {results.currentWeek}.
          </p>
          <p className="text-xs text-gray-600 mt-2">{results.targetDescription}</p>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4">
            <div className="text-sm text-gray-500 mb-1">Birds Sampled</div>
            <div className="text-3xl font-bold text-gray-900">{results.count}</div>
          </div>
          <div className="bg-white rounded-2xl p-4">
            <div className="text-sm text-gray-500 mb-1">Uniformity</div>
            <div className="text-lg font-bold text-gray-900">{getUniformityStars(results.uniformity)}</div>
            <div className="text-xs text-gray-600">{results.uniformity}</div>
          </div>
          <div className="bg-white rounded-2xl p-4">
            <div className="text-sm text-gray-600 mb-2">Weight Range</div>
            <div className="text-lg font-bold text-gray-900">
              {results.min.toFixed(2)} - {results.max.toFixed(2)} kg
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4">
            <div className="text-sm text-gray-600 mb-2">Variation</div>
            <div className="text-lg font-bold text-gray-900">
              {results.cv.toFixed(1)}%
            </div>
            {results.cv < 10 && <div className="text-xs text-green-600">Very uniform!</div>}
            {results.cv >= 15 && <div className="text-xs text-amber-600">Check feed</div>}
          </div>
        </div>
      </div>

      <CalculationBreakdown analysis={results} flock={flock} />

      <div className="bg-white rounded-3xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          Flock Estimates
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Total Birds</div>
            <div className="text-2xl font-bold text-gray-900">{flock.current_count?.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Estimated Total Weight</div>
            <div className="text-2xl font-bold text-gray-900">{results.totalFlockWeight.toLocaleString()} kg</div>
          </div>
        </div>
      </div>

      {results.dailyGain !== null && (
        <div className="bg-white rounded-3xl p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Growth Performance
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Last Check:</span>
              <span className="font-bold text-gray-900">
                {results.previousWeight ? `${results.previousWeight.toFixed(2)} kg` : 'N/A'}
                {results.daysSinceLastCheck ? `(${results.daysSinceLastCheck} days ago)` : ''}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Weight Gain:</span>
              <span className="font-bold text-gray-900">
                {results.previousWeight ? `${(results.average - results.previousWeight).toFixed(2)} kg per bird` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Daily Gain:</span>
              <span className="font-bold text-gray-900">
                {results.dailyGain ? `${results.dailyGain.toFixed(0)} g/day` : 'N/A'}
              </span>
            </div>
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 mt-4">
              <div className="text-lg font-bold text-gray-900">{results.growthRating}</div>
              {isBroiler && results.dailyGain && results.dailyGain >= 60 && results.dailyGain < 80 && (
                <p className="text-sm text-gray-600 mt-1">Target for broilers: 60-80 g/day</p>
              )}
            </div>
          </div>
        </div>
      )}

      {isBroiler && (
        <>
          <div className="bg-white rounded-3xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600" />
              Market Readiness
            </h3>
            <div className={`rounded-2xl p-6 ${
              results.canSell
                ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200'
                : results.marketReady
                ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200'
                : 'bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200'
            }`}>
              <div className="text-2xl font-bold mb-2">{results.marketStatus}</div>
              <p className="text-gray-700 mt-2">{results.recommendation}</p>
              {results.weeksRemaining > 0 && (
                <p className="text-sm text-gray-600 mt-2">
                  Approximately {results.weeksRemaining} week(s) remaining until market ready
                </p>
              )}
            </div>
          </div>

          {!results.canSell && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-3xl p-6">
              <h3 className="font-bold text-lg mb-3">Growth Plan</h3>
              <p className="text-sm text-gray-700 mb-3">Continue current feeding program:</p>
              <ul className="text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Maintain feed quality and quantity</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Monitor water availability 24/7</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Check for signs of illness daily</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Weigh again in 1 week to track progress</span>
                </li>
              </ul>
            </div>
          )}

          {results.canSell && results.saleAnalysis && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-3xl p-6 border-2 border-green-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                Sale Analysis
              </h3>

              <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4">
                  <div className="font-semibold text-gray-900 mb-2">OPTION 1: Sell Now (Per Bird)</div>
                  <div className="text-sm text-gray-600 mb-1">
                    {flock.current_count?.toLocaleString()} birds × 2,500 XAF
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {results.saleAnalysis.sellNowPerBird.toLocaleString()} XAF
                  </div>
                </div>

                <div className="bg-green-100 rounded-2xl p-4 border-2 border-green-300">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div className="font-semibold text-gray-900">OPTION 2: Sell Now (Per Kg) - BETTER</div>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    {results.totalFlockWeight.toLocaleString()} kg × 3,000 XAF/kg
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {results.saleAnalysis.sellNowPerKg.toLocaleString()} XAF
                  </div>
                  <div className="text-sm font-semibold text-green-600 mt-2">
                    Extra profit: +{(results.saleAnalysis.sellNowPerKg - results.saleAnalysis.sellNowPerBird).toLocaleString()} XAF!
                  </div>
                </div>

                {results.saleAnalysis.waitOption && results.dailyGain && results.dailyGain > 50 && (
                  <div className="bg-blue-100 rounded-2xl p-4 border-2 border-blue-300">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <div className="font-semibold text-gray-900">
                        OPTION 3: Wait {results.saleAnalysis.waitOption.days} More Days
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Projected weight:</span>
                        <span className="font-bold">{results.saleAnalysis.waitOption.projectedWeight.toFixed(2)} kg avg ({results.saleAnalysis.waitOption.projectedTotalWeight.toLocaleString()} kg total)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Revenue:</span>
                        <span className="font-bold">{results.saleAnalysis.waitOption.revenue.toLocaleString()} XAF</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Feed cost:</span>
                        <span className="font-bold text-red-600">-{results.saleAnalysis.waitOption.feedCost.toLocaleString()} XAF</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t-2 border-blue-200">
                        <span className="font-semibold text-gray-900">Net extra gain:</span>
                        <span className="font-bold text-blue-700">
                          +{results.saleAnalysis.waitOption.netGain.toLocaleString()} CFA vs selling now
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {results.recommendation && (
                <div className="mt-6 bg-white rounded-2xl p-4 border-2 border-[#3D5F42]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-gray-900" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 mb-1">Recommendation:</div>
                      <div className="text-gray-700">{results.recommendation}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {isLayer && (
        <>
          <div className="bg-white rounded-3xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Laying Readiness
            </h3>
            <div className={`rounded-2xl p-6 ${
              results.canSell
                ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200'
                : results.marketReady
                ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200'
                : 'bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-gray-200'
            }`}>
              <div className="text-2xl font-bold mb-2">{results.marketStatus}</div>
              <p className="text-gray-700 mt-2">{results.recommendation}</p>
              {results.weeksRemaining > 0 && (
                <p className="text-sm text-gray-600 mt-2">
                  Approximately {results.weeksRemaining} week(s) remaining
                </p>
              )}
            </div>
          </div>

          {!results.marketReady && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-3xl p-6">
              <h3 className="font-bold text-lg mb-3">Growth Plan</h3>
              <p className="text-sm text-gray-700 mb-3">Continue pullet rearing program:</p>
              <ul className="text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Maintain steady growth with quality feed</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Ensure 14-16 hours of light daily</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Monitor health and vaccination schedule</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Prepare nesting boxes before Week 18</span>
                </li>
              </ul>
            </div>
          )}
        </>
      )}

      <ShareWeightReport flock={flock} results={results} farmName={farmName} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
        <button
          onClick={handlePDFExport}
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 py-4 rounded-xl font-bold hover:bg-[#f5f0e8] transition-all"
        >
          <Download className="w-5 h-5" />
          Export as PDF
        </button>
        {onViewHistory && (
          <button
            onClick={onViewHistory}
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 py-4 rounded-xl font-bold hover:bg-[#f5f0e8] transition-all"
          >
            <History className="w-5 h-5" />
            View History
          </button>
        )}
        <button
          onClick={onNewCheck}
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 py-4 rounded-xl font-bold hover:bg-[#f5f0e8] transition-all"
        >
          Record Another Check
        </button>
      </div>
    </div>
  );
}
