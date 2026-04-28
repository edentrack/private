import { useState } from 'react';
import { ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import { WeightAnalysisResult } from '../../utils/weightAnalysis';
import { Flock } from '../../types/database';

interface CalculationBreakdownProps {
  analysis: WeightAnalysisResult;
  flock: Flock;
}

export function CalculationBreakdown({ analysis, flock }: CalculationBreakdownProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { transparency } = analysis;

  return (
    <div className="border border-gray-300 rounded-lg p-4 mb-6 bg-gray-50">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center justify-between w-full text-left hover:bg-gray-100 -m-4 p-4 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3">
          <Calculator className="w-5 h-5 text-[#3D5F42]" />
          <span className="font-semibold text-gray-900">How we calculated this</span>
        </div>
        {showDetails ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {showDetails && (
        <div className="mt-6 space-y-6 text-sm">
          <div>
            <p className="font-semibold mb-3 text-gray-900">1. Sample Data Collected:</p>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <p className="mb-2 text-gray-700">
                You weighed <span className="font-bold">{transparency.individualWeights.length} birds</span>:
              </p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200 mb-3">
                <p className="font-mono text-xs text-gray-700 break-all">
                  {transparency.individualWeights.map((w, i) => (
                    <span key={i}>
                      {w.toFixed(2)}kg{i < transparency.individualWeights.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className={transparency.confidence >= 80 ? 'text-green-600' : 'text-yellow-600'}>
                  {transparency.confidence >= 80 ? '✅' : '⚠️'}
                </span>
                <div>
                  <p className="text-gray-600">
                    Recommended sample size for {flock.current_count} birds: <span className="font-semibold">{transparency.recommendedSampleSize} birds</span>
                  </p>
                  <p className="font-semibold mt-1" style={{ color: transparency.confidence >= 80 ? '#16a34a' : '#ca8a04' }}>
                    Confidence level: {transparency.confidence}%
                  </p>
                  {transparency.confidence < 80 && (
                    <p className="text-yellow-700 mt-1">
                      Consider weighing more birds for higher accuracy
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-3 text-gray-900">2. Average Weight Calculation:</p>
            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Formula:</span> Sum of all weights ÷ Number of birds
              </p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-1">
                <p className="font-mono text-xs text-gray-700">
                  ({transparency.individualWeights.map(w => w.toFixed(2)).join(' + ')}) ÷ {transparency.individualWeights.length}
                </p>
                <p className="font-mono text-xs text-gray-700">
                  = {transparency.weightsSum.toFixed(2)} ÷ {transparency.individualWeights.length}
                </p>
                <p className="font-mono text-base font-bold text-[#3D5F42] mt-2">
                  = {analysis.average.toFixed(2)} kg per bird
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-3 text-gray-900">3. Uniformity (Coefficient of Variation):</p>
            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Formula:</span> (Standard Deviation ÷ Average) × 100
              </p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-1">
                <p className="text-xs text-gray-600 mb-2">
                  Standard deviation measures how much weights vary from the average
                </p>
                <p className="font-mono text-xs text-gray-700">
                  Standard Deviation = {analysis.stdDev.toFixed(3)} kg
                </p>
                <p className="font-mono text-xs text-gray-700">
                  CV = ({analysis.stdDev.toFixed(3)} ÷ {analysis.average.toFixed(2)}) × 100
                </p>
                <p className="font-mono text-base font-bold text-[#3D5F42] mt-2">
                  = {analysis.cv.toFixed(1)}% ({analysis.uniformity})
                </p>
              </div>
              <div className="mt-3 text-xs text-gray-600 bg-blue-50 p-3 rounded border border-blue-200">
                <p className="font-medium mb-2">Uniformity Scale:</p>
                <ul className="space-y-1">
                  <li className="text-green-600">• Excellent: &lt;5% (very consistent flock)</li>
                  <li className="text-blue-600">• Good: 5-10% (normal variation)</li>
                  <li className="text-yellow-600">• Fair: 10-15% (some inconsistency)</li>
                  <li className="text-red-600">• Poor: &gt;15% (investigate feed/health issues)</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-3 text-gray-900">4. Comparison to Target:</p>
            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
              <p className="text-gray-700">Current Week: <span className="font-bold">Week {analysis.currentWeek}</span></p>
              <p className="text-gray-700">
                Target Weight for Week {analysis.currentWeek}: <span className="font-bold">{analysis.targetWeight.toFixed(2)} kg</span>
              </p>
              <p className="text-xs text-gray-600 mb-2">{analysis.targetDescription}</p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-1">
                <p className="font-mono text-xs text-gray-700">
                  Percent of Target = ({analysis.average.toFixed(2)} ÷ {analysis.targetWeight.toFixed(2)}) × 100
                </p>
                <p className="font-mono text-base font-bold text-[#3D5F42] mt-2">
                  = {analysis.percentOfTarget.toFixed(1)}%
                </p>
              </div>
              <div className="mt-3 text-sm bg-blue-50 p-3 rounded border border-blue-200">
                {analysis.percentOfTarget >= 95 ? (
                  <p className="text-green-700 font-medium">✅ On track! Birds are meeting or exceeding growth targets.</p>
                ) : analysis.percentOfTarget >= 85 ? (
                  <p className="text-yellow-700 font-medium">🟡 Slightly below target - monitor feed intake and health closely.</p>
                ) : (
                  <p className="text-red-700 font-medium">🔴 Below target - urgent: check feed quality, quantity, and consult veterinarian.</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-3 text-gray-900">5. Total Flock Weight Estimate:</p>
            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Formula:</span> Average Weight × Number of Birds
              </p>
              <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-1">
                <p className="font-mono text-xs text-gray-700">
                  {analysis.average.toFixed(2)} kg × {flock.current_count} birds
                </p>
                <p className="font-mono text-base font-bold text-[#3D5F42] mt-2">
                  = {analysis.totalFlockWeight.toLocaleString()} kg total
                </p>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Based on sample of {transparency.individualWeights.length} birds (confidence: {transparency.confidence}%)
              </p>
            </div>
          </div>

          {flock.type === 'Broiler' && (
            <div>
              <p className="font-semibold mb-3 text-gray-900">6. Market Readiness Decision:</p>
              <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
                <p className="text-gray-700 mb-3">Criteria for "Market Ready":</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3">
                    <span className={`text-lg ${transparency.meetsAgeRequirement ? 'text-green-600' : 'text-red-600'}`}>
                      {transparency.meetsAgeRequirement ? '✅' : '❌'}
                    </span>
                    <div className="text-sm flex-1">
                      <p className={transparency.meetsAgeRequirement ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                        Age: Week {analysis.currentWeek} {transparency.meetsAgeRequirement ? '≥' : '<'} {transparency.minAge} weeks (minimum)
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {transparency.meetsAgeRequirement
                          ? 'Birds are old enough for market'
                          : `Need ${transparency.minAge - analysis.currentWeek} more week(s) to reach minimum age`}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className={`text-lg ${transparency.meetsMinWeightRequirement ? 'text-green-600' : 'text-red-600'}`}>
                      {transparency.meetsMinWeightRequirement ? '✅' : '❌'}
                    </span>
                    <div className="text-sm flex-1">
                      <p className={transparency.meetsMinWeightRequirement ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                        Weight: {analysis.average.toFixed(2)} kg {transparency.meetsMinWeightRequirement ? '≥' : '<'} {transparency.minWeight} kg (minimum)
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {transparency.meetsMinWeightRequirement
                          ? 'Birds meet minimum market weight'
                          : `Need ${(transparency.minWeight - analysis.average).toFixed(2)} kg more to reach minimum weight`}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className={`text-lg ${transparency.meetsOptimalWeightRequirement ? 'text-green-600' : 'text-yellow-600'}`}>
                      {transparency.meetsOptimalWeightRequirement ? '✅' : '🟡'}
                    </span>
                    <div className="text-sm flex-1">
                      <p className={transparency.meetsOptimalWeightRequirement ? 'text-green-700 font-medium' : 'text-yellow-700 font-medium'}>
                        Optimal: {analysis.average.toFixed(2)} kg {transparency.meetsOptimalWeightRequirement ? '≥' : '<'} {transparency.optimalWeight} kg (best price)
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {transparency.meetsOptimalWeightRequirement
                          ? 'Birds are at optimal weight for maximum profit'
                          : `Need ${(transparency.optimalWeight - analysis.average).toFixed(2)} kg more for optimal price`}
                      </p>
                    </div>
                  </li>
                </ul>
                <div className="pt-3 border-t border-gray-200">
                  <p className="font-bold text-base text-gray-900">
                    Result: <span className={analysis.canSell ? 'text-green-600' : 'text-yellow-600'}>{analysis.marketStatus}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {analysis.canSell && analysis.saleAnalysis && (
            <div>
              <p className="font-semibold mb-3 text-gray-900">7. Sale Value Calculations:</p>
              <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2 text-gray-700">Per Bird Method:</p>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-1">
                    <p className="font-mono text-xs text-gray-700">
                      {flock.current_count} birds × {transparency.pricePerBird.toLocaleString()} XAF/bird
                    </p>
                    <p className="font-mono text-base font-bold text-gray-900">
                      = {analysis.saleAnalysis.sellNowPerBird.toLocaleString()} XAF
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2 text-gray-700">Per Kg Method:</p>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-1">
                    <p className="font-mono text-xs text-gray-700">
                      {analysis.totalFlockWeight.toLocaleString()} kg × {transparency.pricePerKg.toLocaleString()} XAF/kg
                    </p>
                    <p className="font-mono text-base font-bold text-gray-900">
                      = {analysis.saleAnalysis.sellNowPerKg.toLocaleString()} XAF
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-3">
                  <p className="text-sm text-green-700 font-semibold">
                    ✅ Best method: {analysis.saleAnalysis.sellNowPerKg > analysis.saleAnalysis.sellNowPerBird ? 'Per Kg' : 'Per Bird'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Extra profit: +{Math.abs(analysis.saleAnalysis.sellNowPerKg - analysis.saleAnalysis.sellNowPerBird).toLocaleString()} XAF
                  </p>
                </div>
              </div>
            </div>
          )}

          {transparency.reasoning.length > 0 && (
            <div>
              <p className="font-semibold mb-3 text-gray-900">Why This Recommendation:</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <ul className="space-y-2">
                  {transparency.reasoning.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="border-t border-gray-300 pt-4 mt-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold block mb-2">Data Sources:</span>
              <span className="block mb-1">• Growth targets: {transparency.targetsSource}</span>
              <span className="block mb-1">• Prices: Farm settings (editable in Settings)</span>
              <span className="block mb-1">• Sample size: Based on flock size ({flock.current_count} birds)</span>
              <span className="block">• Calculations: Standard statistical methods</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
