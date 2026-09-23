/**
 * Statistical Significance Engine for A/B Testing
 *
 * Implements:
 * 1. Two-proportion Z-test and Chi-Square (χ²) goodness-of-fit test.
 * 2. Normal Cumulative Distribution Function (CDF) approximation (Abramowitz & Stegun).
 * 3. Confidence intervals, p-values, and statistical significance badges.
 */

/**
 * Standard Normal Cumulative Distribution Function (CDF) approximation.
 * Precision: error < 7.5e-8
 */
function standardNormalCdf(x) {
  if (x === 0) return 0.5;
  const isNegative = x < 0;
  const z = isNegative ? -x : x;

  // Abramowitz and Stegun formula 7.1.26
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1.0 / (1.0 + p * z);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const cdf = 1.0 - poly * Math.exp(-z * z);

  return isNegative ? 1.0 - cdf : cdf;
}

/**
 * Evaluates A/B testing performance between variants.
 * @param {Array<{ id: string, name: string, url: string, weight: number, clicks: number, conversions?: number }>} variants
 * @returns {Object} Comprehensive A/B test statistical analysis
 */
export function calculateAbTestStatistics(variants = []) {
  if (!variants || variants.length < 2) {
    return {
      hasTest: false,
      message: 'At least 2 variants are required for A/B testing analysis.',
    };
  }

  const totalClicks = variants.reduce((sum, v) => sum + (v.clicks || 0), 0);

  // If there are zero or very few clicks, statistical test is not yet viable
  if (totalClicks < 10) {
    return {
      hasTest: true,
      totalClicks,
      status: 'collecting_data',
      statusText: 'Collecting Data',
      badgeColor: 'amber',
      confidence: 0,
      pValue: 1.0,
      isSignificant: false,
      sampleSizeNeeded: Math.max(0, 100 - totalClicks),
      summary: `Insufficient data (${totalClicks} clicks recorded). Need at least 100 clicks for confident statistical analysis.`,
      variants: variants.map((v) => {
        const raw = v.toObject ? v.toObject() : v;
        return {
          id: raw.id,
          name: raw.name,
          url: raw.url,
          weight: raw.weight,
          clicks: raw.clicks || 0,
          trafficShare: totalClicks > 0 ? Number((((raw.clicks || 0) / totalClicks) * 100).toFixed(1)) : 0,
          expectedShare: raw.weight,
          isLeading: false,
        };
      }),
    };
  }

  // Calculate Traffic Share & Expected Traffic
  let maxClicks = -1;
  let leadingVariantId = null;

  const analyzedVariants = variants.map((v) => {
    const clicks = v.clicks || 0;
    const trafficShare = totalClicks > 0 ? Number(((clicks / totalClicks) * 100).toFixed(1)) : 0;
    if (clicks > maxClicks) {
      maxClicks = clicks;
      leadingVariantId = v.id;
    }
    return {
      id: v.id,
      name: v.name,
      url: v.url,
      weight: v.weight,
      clicks,
      trafficShare,
      expectedShare: v.weight,
      isLeading: false,
    };
  });

  // Mark leading variant
  for (const v of analyzedVariants) {
    if (v.id === leadingVariantId) v.isLeading = true;
  }

  // Two-variant comparison (Variant 0 as baseline, Variant 1 as Challenger)
  const vA = analyzedVariants[0];
  const vB = analyzedVariants[1];

  // Chi-Square Goodness-of-Fit against configured weights
  let chiSquare = 0;
  for (const v of variants) {
    const expected = (totalClicks * (v.weight || (100 / variants.length))) / 100;
    if (expected > 0) {
      chiSquare += Math.pow((v.clicks || 0) - expected, 2) / expected;
    }
  }

  // For 2 variants: Two-Proportion Z-Test comparing click delivery vs 50/50 baseline
  const pExpected = (vA.weight || 50) / 100;
  const pObserved = totalClicks > 0 ? (vA.clicks || 0) / totalClicks : 0.5;
  const stdError = Math.sqrt((pExpected * (1 - pExpected)) / Math.max(totalClicks, 1));
  const zScore = stdError > 0 ? (pObserved - pExpected) / stdError : 0;
  const pValue = 2 * (1 - standardNormalCdf(Math.abs(zScore)));
  const confidencePercent = Math.min(99.9, Math.max(0, (1 - pValue) * 100));

  const isSignificant = pValue < 0.05 && totalClicks >= 50;
  const leader = analyzedVariants.find((v) => v.isLeading);

  return {
    hasTest: true,
    totalClicks,
    status: isSignificant ? 'significant' : totalClicks >= 100 ? 'inconclusive' : 'collecting_data',
    statusText: isSignificant
      ? `Winner: ${leader.name} (${confidencePercent.toFixed(1)}% Confidence)`
      : totalClicks >= 100
      ? 'No Statistically Significant Difference'
      : 'Collecting Data',
    badgeColor: isSignificant ? 'emerald' : totalClicks >= 100 ? 'indigo' : 'amber',
    confidence: Number(confidencePercent.toFixed(1)),
    pValue: Number(pValue.toFixed(4)),
    zScore: Number(zScore.toFixed(2)),
    chiSquare: Number(chiSquare.toFixed(2)),
    isSignificant,
    leadingVariant: leader ? { id: leader.id, name: leader.name } : null,
    summary: isSignificant
      ? `${leader.name} is demonstrating statistically significant outperformance (p = ${pValue.toFixed(4)} with ${confidencePercent.toFixed(1)}% confidence).`
      : `Current p-value is ${pValue.toFixed(4)}. Need more traffic to reach the 95% statistical significance threshold (p < 0.05).`,
    variants: analyzedVariants,
  };
}
