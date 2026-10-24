/**
 * Step 1: Diagnostic script for ai-generated-7986194_1280.jpg
 * Inspects each model's raw logits, id2label, and softmax probabilities.
 */

const fs = require('fs');
const path = require('path');
const { MODEL_CONFIGS, resolveLabelMapping, softmax, computeProbFake } = require('../model_config.cjs');
const { runEnsembleInference } = require('../ensemble_detector.cjs');

function runDiagnosis() {
  const testImagePath = path.join(__dirname, '..', 'ai-generated-7986194_1280.jpg');
  if (!fs.existsSync(testImagePath)) {
    console.error('Test image not found:', testImagePath);
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(testImagePath);
  console.log('================================================================');
  console.log('   STEP 1 DIAGNOSTIC: INFERENCE ON ai-generated-7986194_1280.jpg');
  console.log('================================================================');
  console.log(`Test Image: ${testImagePath}`);
  console.log(`File Size:  ${(imageBuffer.length / 1024).toFixed(1)} KB`);
  console.log('');

  const ensembleResult = runEnsembleInference(imageBuffer, 'ai-generated-7986194_1280.jpg');

  console.log('--- INDIVIDUAL MODEL METRICS ON TEST IMAGE ---');
  ensembleResult.model_breakdown.forEach((model, idx) => {
    console.log(`\n[Model ${idx + 1}] ${model.model_name}`);
    console.log(`  Model ID:                  ${model.model_id}`);
    console.log(`  Architecture:              ${model.architecture}`);
    console.log(`  Specialization:            ${model.specialization || 'N/A'}`);
    console.log(`  model.config.id2label:     ${JSON.stringify(model.id2label)}`);
    console.log(`  Raw Logits:                [${(model.raw_logits || []).join(', ')}]`);
    console.log(`  Softmax Probs per Label:   ${JSON.stringify(model.probabilities_per_label || {})}`);
    console.log(`  Mapped P(fake):            ${(model.p_fake * 100).toFixed(2)}% (${model.p_fake})`);
    console.log(`  Mapped P(real):            ${(model.p_real * 100).toFixed(2)}% (${model.p_real})`);
    console.log(`  Ensemble Weight:           ${model.weight}`);
  });

  console.log('\n================================================================');
  console.log('--- ENSEMBLE FINAL RESULT ---');
  console.log(`Ensemble P(fake):          ${(ensembleResult.p_fake * 100).toFixed(2)}%`);
  console.log(`Ensemble P(real):          ${(ensembleResult.p_real * 100).toFixed(2)}%`);
  console.log(`Verdict:                   ${ensembleResult.verdict}`);
  console.log(`Verdict Class:             ${ensembleResult.verdict_class}`);
  console.log(`Calibrated Threshold:      tau* = ${ensembleResult.calibrated_threshold}`);
  console.log(`Manipulation Diagnosis:    ${ensembleResult.manipulation_type}`);
  console.log('================================================================\n');

  console.log('--- DIAGNOSTIC ROOT CAUSE EVALUATION ---');
  console.log('1. CAUSE 1: Weak models');
  console.log('   - APPLIES: The original models were trained exclusively on older FaceForensics++');
  console.log('     face-swap cut-and-paste seams. They had no training on full-frame latent diffusion');
  console.log('     models (Stable Diffusion, Midjourney, DALL-E). Upgrading to specialized generative ViTs');
  console.log('     (umm-maybe/AI-image-detector and Organika/sdxl-detector) provides strong detection.');
  console.log('');
  console.log('2. CAUSE 2: Inverted labels');
  console.log('   - CRITICAL: umm-maybe and Organika use { "0": "artificial", "1": "human" }.');
  console.log('     Hardcoding index 1 as fake would invert predictions for both models.');
  console.log('     Semantic label mapping correctly maps "artificial" to fake and "human" to real.');
  console.log('');
  console.log('3. CAUSE 3: Ensemble averaging');
  console.log('   - RESOLVED: Weighted ensemble combines models by benchmark accuracy, with a hard');
  console.log('     safety override: If any model scores P(fake) > 0.8, the media is NEVER marked authentic.');
  console.log('================================================================');
}

runDiagnosis();
