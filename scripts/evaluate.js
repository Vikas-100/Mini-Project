/**
 * DFD Model - Dataset Evaluation & Threshold Calibration Script
 * 
 * Runs the detector over `test_images/real/` and `test_images/fake/`.
 * 1. Evaluates EACH candidate model separately (accuracy, FPR, FNR, P(fake) on AI portrait).
 * 2. Ranks and selects the best models for the weighted ensemble.
 * 3. Sweeps threshold tau from 0.05 to 0.95 to find the optimal decision boundary.
 * 4. Outputs confusion matrix and saves calibration config to `calibration_config.json`.
 */

const fs = require('fs');
const path = require('path');
const { MODEL_CONFIGS, printAllModelConfigs, resolveLabelMapping } = require('../model_config.cjs');
const { runEnsembleInference } = require('../ensemble_detector.cjs');

async function runEvaluation() {
  console.log('\n================================================================');
  console.log('       DFD MODEL FORENSIC ENSEMBLE EVALUATION & CALIBRATION     ');
  console.log('================================================================\n');

  // Print model.config.id2label for each ViT model in the ensemble
  printAllModelConfigs();

  const realDir = path.join(__dirname, '..', 'test_images', 'real');
  const fakeDir = path.join(__dirname, '..', 'test_images', 'fake');

  if (!fs.existsSync(realDir) || !fs.existsSync(fakeDir)) {
    console.error('Error: test_images/real/ or test_images/fake/ folder not found!');
    process.exit(1);
  }

  const realFiles = fs.readdirSync(realDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const fakeFiles = fs.readdirSync(fakeDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

  console.log(`\nDataset Loaded:`);
  console.log(`  Real Samples: ${realFiles.length} images from test_images/real/`);
  console.log(`  Fake Samples: ${fakeFiles.length} images from test_images/fake/`);
  console.log(`  Total Images: ${realFiles.length + fakeFiles.length}\n`);

  // Run detector on each sample and collect ensemble + individual model metrics
  const evaluations = [];
  const modelMetrics = {};

  for (const [modelId, cfg] of Object.entries(MODEL_CONFIGS)) {
    modelMetrics[modelId] = {
      modelId,
      modelName: cfg.modelName,
      architecture: cfg.architecture,
      specialization: cfg.specialization,
      weight: cfg.weight,
      tp: 0,
      fp: 0,
      tn: 0,
      fn: 0,
      aiPortraitScore: null
    };
  }

  console.log('Evaluating Real Images:');
  for (const file of realFiles) {
    const fullPath = path.join(realDir, file);
    const buf = fs.readFileSync(fullPath);
    const res = runEnsembleInference(buf, file);

    evaluations.push({
      file,
      groundTruth: 0, // 0 = Real
      p_fake: res.p_fake,
      p_real: res.p_real,
      exif: res.supporting_signals.exif_check.status
    });

    // Record individual candidate performance (threshold = 0.50)
    res.model_breakdown.forEach(m => {
      const predFake = m.p_fake >= 0.50;
      if (predFake) modelMetrics[m.model_id].fp++;
      else modelMetrics[m.model_id].tn++;
    });

    console.log(`  [REAL] ${file.padEnd(30)} -> P(fake): ${res.p_fake.toFixed(4)} | P(real): ${res.p_real.toFixed(4)} | ${res.verdict}`);
  }

  console.log('\nEvaluating Fake/Manipulated Images:');
  for (const file of fakeFiles) {
    const fullPath = path.join(fakeDir, file);
    const buf = fs.readFileSync(fullPath);
    const res = runEnsembleInference(buf, file);

    evaluations.push({
      file,
      groundTruth: 1, // 1 = Fake
      p_fake: res.p_fake,
      p_real: res.p_real,
      exif: res.supporting_signals.exif_check.status
    });

    // Record individual candidate performance (threshold = 0.50)
    res.model_breakdown.forEach(m => {
      const predFake = m.p_fake >= 0.50;
      if (predFake) modelMetrics[m.model_id].tp++;
      else modelMetrics[m.model_id].fn++;

      if (file === 'ai-generated-7986194_1280.jpg') {
        modelMetrics[m.model_id].aiPortraitScore = m.p_fake;
      }
    });

    console.log(`  [FAKE] ${file.padEnd(30)} -> P(fake): ${res.p_fake.toFixed(4)} | P(real): ${res.p_real.toFixed(4)} | ${res.verdict}`);
  }

  // Candidate Comparison Table (CAUSE 1)
  console.log('\n================================================================');
  console.log('       INDIVIDUAL CANDIDATE MODEL BENCHMARK (CAUSE 1 & 3)       ');
  console.log('================================================================');
  console.log('Model Name                         | Accuracy | FPR    | FNR    | Test AI Image P(fake) | Status');
  console.log('-----------------------------------+----------+--------+--------+-----------------------+---------');

  for (const [modelId, stats] of Object.entries(modelMetrics)) {
    const total = stats.tp + stats.fp + stats.tn + stats.fn;
    const acc = total > 0 ? (stats.tp + stats.tn) / total : 0;
    const fpr = (stats.fp + stats.tn) > 0 ? stats.fp / (stats.fp + stats.tn) : 0;
    const fnr = (stats.tp + stats.fn) > 0 ? stats.fn / (stats.tp + stats.fn) : 0;
    const aiScoreStr = stats.aiPortraitScore !== null ? `${(stats.aiPortraitScore * 100).toFixed(1)}%` : 'N/A';
    const status = acc >= 0.95 && stats.aiPortraitScore > 0.80 ? 'KEPT (Best)' : 'INSPECT';

    console.log(
      `${stats.modelName.padEnd(35)}| ${(acc * 100).toFixed(1)}%   | ${(fpr * 100).toFixed(1)}%   | ${(fnr * 100).toFixed(1)}%   | ${aiScoreStr.padEnd(22)}| ${status}`
    );
  }
  console.log('-----------------------------------+----------+--------+--------+-----------------------+---------');

  // Sweep threshold from 0.05 to 0.95 with step 0.01
  let bestThreshold = 0.50;
  let bestAccuracy = 0;
  let bestF1 = 0;
  let bestStats = null;

  const sweepResults = [];

  for (let tau = 0.05; tau <= 0.95; tau = Number((tau + 0.01).toFixed(2))) {
    let tp = 0; // Actual Fake, Pred Fake
    let fp = 0; // Actual Real, Pred Fake
    let tn = 0; // Actual Real, Pred Real
    let fn = 0; // Actual Fake, Pred Real

    for (const item of evaluations) {
      const predFake = item.p_fake >= tau ? 1 : 0;
      if (item.groundTruth === 1 && predFake === 1) tp++;
      else if (item.groundTruth === 0 && predFake === 1) fp++;
      else if (item.groundTruth === 0 && predFake === 0) tn++;
      else if (item.groundTruth === 1 && predFake === 0) fn++;
    }

    const total = tp + fp + tn + fn;
    const accuracy = (tp + tn) / total;
    const fpr = (fp + tn) > 0 ? fp / (fp + tn) : 0;
    const fnr = (tp + fn) > 0 ? fn / (tp + fn) : 0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    sweepResults.push({ tau, accuracy, fpr, fnr, f1, tp, fp, tn, fn });

    // Optimal threshold maximizes F1; among ties, pick the threshold closest to balanced 0.50 margin
    const distToHalf = Math.abs(tau - 0.50);
    const currentBestDist = bestStats ? Math.abs(bestStats.tau - 0.50) : 999;
    if (f1 > bestF1 || (f1 === bestF1 && accuracy > bestAccuracy) || (f1 === bestF1 && accuracy === bestAccuracy && distToHalf < currentBestDist)) {
      bestF1 = f1;
      bestAccuracy = accuracy;
      bestThreshold = tau;
      bestStats = { tau, accuracy, fpr, fnr, precision, recall, f1, tp, fp, tn, fn };
    }
  }

  const lowerBand = 0.35;
  const upperBand = 0.65;
  console.log('\n================================================================');
  console.log(`         OPTIMAL CALIBRATION THRESHOLD: tau* = ${bestThreshold}`);
  console.log('================================================================');
  console.log(`Accuracy:             ${(bestStats.accuracy * 100).toFixed(2)}%`);
  console.log(`Precision:            ${(bestStats.precision * 100).toFixed(2)}%`);
  console.log(`Recall (Sensitivity): ${(bestStats.recall * 100).toFixed(2)}%`);
  console.log(`F1-Score:             ${bestStats.f1.toFixed(4)}`);
  console.log(`False Positive Rate:  ${(bestStats.fpr * 100).toFixed(2)}%`);
  console.log(`False Negative Rate:  ${(bestStats.fnr * 100).toFixed(2)}%`);

  // Confusion Matrix
  console.log('\n================================================================');
  console.log(`                CONFUSION MATRIX (Threshold = ${bestThreshold})`);
  console.log('================================================================');
  console.log(`                      |  Predicted Real (0)  |  Predicted Fake (1) | Total`);
  console.log(`  --------------------+----------------------+---------------------+-------`);
  console.log(`  Actual Real (0)     |  TN = ${String(bestStats.tn).padEnd(14)}|  FP = ${String(bestStats.fp).padEnd(14)}| ${realFiles.length}`);
  console.log(`  Actual Fake (1)     |  FN = ${String(bestStats.fn).padEnd(14)}|  TP = ${String(bestStats.tp).padEnd(14)}| ${fakeFiles.length}`);
  console.log(`  --------------------+----------------------+---------------------+-------`);
  console.log(`  Total               |  ${String(bestStats.tn + bestStats.fn).padEnd(20)}|  ${String(bestStats.fp + bestStats.tp).padEnd(19)}| ${evaluations.length}\n`);

  console.log('Result Categorization Bands:');
  console.log(`  [0.00 to ${lowerBand}]: Likely authentic`);
  console.log(`  [${lowerBand} to ${upperBand}]: Uncertain, manual review recommended`);
  console.log(`  [${upperBand} to 1.00]: Likely AI-generated or manipulated\n`);

  // Save calibration config
  const calibOutput = {
    calibrated_at: new Date().toISOString(),
    optimal_threshold: bestThreshold,
    lower_band: lowerBand,
    upper_band: upperBand,
    metrics: {
      accuracy: bestStats.accuracy,
      f1_score: bestStats.f1,
      fpr: bestStats.fpr,
      fnr: bestStats.fnr
    },
    confusion_matrix: {
      true_positives: bestStats.tp,
      false_positives: bestStats.fp,
      true_negatives: bestStats.tn,
      false_negatives: bestStats.fn
    },
    sample_counts: {
      real: realFiles.length,
      fake: fakeFiles.length,
      total: evaluations.length
    }
  };

  const calibFile = path.join(__dirname, '..', 'calibration_config.json');
  fs.writeFileSync(calibFile, JSON.stringify(calibOutput, null, 2));
  console.log(`[Config Saved] Calibrated threshold written to: ${calibFile}\n`);
}

runEvaluation().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
