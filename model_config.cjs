/**
 * DFD Model - Ensemble Configuration & Dynamic Label Resolver
 * 
 * Fixes label mapping inversion bug by resolving labels by semantic name,
 * never hardcoding index 0 or index 1 as "fake".
 */

const MODEL_CONFIGS = {
  'umm-maybe/AI-image-detector': {
    modelId: 'umm-maybe/AI-image-detector',
    modelName: 'ViT-Base AI-Generated Detector (umm-maybe)',
    architecture: 'google/vit-base-patch16-224',
    // Inverted Model: index 0 is artificial (FAKE), index 1 is human (REAL)!
    id2label: { 0: 'artificial', 1: 'human' },
    realLabels: ['human', 'real', 'authentic', 'genuine', 'organic', 'realart'],
    fakeLabels: ['artificial', 'fake', 'synthetic', 'generated', 'deepfake', 'aiartdata'],
    weight: 0.40,
    specialization: 'Stable Diffusion, Midjourney, DALL-E, and Generative Latent Diffusion Artifacts',
    inputSize: [224, 224],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225]
  },
  'Organika/sdxl-detector': {
    modelId: 'Organika/sdxl-detector',
    modelName: 'SDXL & Midjourney Diffusion ViT (Organika)',
    architecture: 'vit-base-patch16-224-sdxl',
    // Inverted Model: index 0 is artificial (FAKE), index 1 is human (REAL)!
    id2label: { 0: 'artificial', 1: 'human' },
    realLabels: ['human', 'real', 'authentic', 'genuine', 'organic', 'realart'],
    fakeLabels: ['artificial', 'fake', 'synthetic', 'generated', 'deepfake', 'aiartdata'],
    weight: 0.35,
    specialization: 'SDXL & High-Resolution Generative Portraits and Photorealistic AI Synthetics',
    inputSize: [224, 224],
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5]
  },
  'dima806/deepfake_vs_real': {
    modelId: 'dima806/deepfake_vs_real',
    modelName: 'ViT-Patch16 FaceForensics & Deepfake (dima806)',
    architecture: 'google/vit-base-patch16-224',
    // Standard Model: index 0 is REAL, index 1 is FAKE
    id2label: { 0: 'REAL', 1: 'FAKE' },
    realLabels: ['real', 'authentic', 'genuine', 'human', 'organic', 'realart'],
    fakeLabels: ['fake', 'deepfake', 'manipulated', 'synthetic', 'artificial', 'aiartdata'],
    weight: 0.25,
    specialization: 'FaceForensics++, Celeb-DF Face-Swaps, Boundary Splicing, and Feature Morphing',
    inputSize: [224, 224],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225]
  }
};

/**
 * Print model.config.id2label for each ViT model in the ensemble.
 */
function printAllModelConfigs() {
  console.log('================================================================');
  console.log('       DFD MODEL ENSEMBLE: MODEL.CONFIG.ID2LABEL REGISTRY       ');
  console.log('================================================================');
  for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
    console.log(`[Model: ${config.modelId}]`);
    console.log(`  Name:           ${config.modelName}`);
    console.log(`  Architecture:   ${config.architecture}`);
    console.log(`  Specialization: ${config.specialization}`);
    console.log(`  id2label:      `, JSON.stringify(config.id2label));
    const mapping = resolveLabelMapping(config);
    console.log(`  Resolved Mapping -> Fake Indices: [${mapping.fakeIndices.join(', ')}], Real Indices: [${mapping.realIndices.join(', ')}]`);
    console.log('----------------------------------------------------------------');
  }
}

/**
 * Resolves label mapping by label name (never hardcoding 0 or 1).
 * Inspects model.config.id2label against realLabels and fakeLabels.
 */
function resolveLabelMapping(modelConfig) {
  const id2label = modelConfig.id2label || {};
  const realLabels = (modelConfig.realLabels || []).map(l => l.toLowerCase());
  const fakeLabels = (modelConfig.fakeLabels || []).map(l => l.toLowerCase());

  const fakeIndices = [];
  const realIndices = [];

  for (const [idStr, labelName] of Object.entries(id2label)) {
    const id = parseInt(idStr, 10);
    const cleanLabel = String(labelName).toLowerCase().trim();

    const isFake = fakeLabels.some(pattern => cleanLabel.includes(pattern));
    const isReal = realLabels.some(pattern => cleanLabel.includes(pattern));

    if (isFake && !isReal) {
      fakeIndices.push(id);
    } else if (isReal && !isFake) {
      realIndices.push(id);
    } else {
      // Direct exact match heuristics
      if (cleanLabel === 'fake' || cleanLabel === 'deepfake' || cleanLabel.startsWith('ai') || cleanLabel === 'artificial') {
        fakeIndices.push(id);
      } else {
        realIndices.push(id);
      }
    }
  }

  // Safety check: ensure both classes are resolved
  if (fakeIndices.length === 0 || realIndices.length === 0) {
    throw new Error(`Label mapping resolution failed for model "${modelConfig.modelName}". id2label: ${JSON.stringify(id2label)}`);
  }

  return {
    fakeIndices,
    realIndices,
    id2label
  };
}

/**
 * Numerically stable Softmax calculation.
 */
function softmax(logits, temperature = 1.0) {
  const maxVal = Math.max(...logits);
  const exps = logits.map(v => Math.exp((v - maxVal) / temperature));
  const sumExps = exps.reduce((acc, curr) => acc + curr, 0);
  return exps.map(v => v / sumExps);
}

/**
 * Computes P(fake) from raw model output (logits or probabilities)
 * using the dynamic label mapping.
 */
function computeProbFake(rawOutput, modelConfig, isLogits = true) {
  const mapping = resolveLabelMapping(modelConfig);
  const probs = isLogits ? softmax(rawOutput) : rawOutput;

  let sumFakeProb = 0;
  for (const idx of mapping.fakeIndices) {
    if (idx < probs.length) {
      sumFakeProb += probs[idx];
    }
  }

  let sumRealProb = 0;
  for (const idx of mapping.realIndices) {
    if (idx < probs.length) {
      sumRealProb += probs[idx];
    }
  }

  const total = sumFakeProb + sumRealProb;
  const pFake = total > 0 ? (sumFakeProb / total) : 0.5;

  const probabilitiesPerLabel = {};
  for (const [idStr, labelName] of Object.entries(mapping.id2label)) {
    const idx = parseInt(idStr, 10);
    probabilitiesPerLabel[labelName] = Number(probs[idx].toFixed(5));
  }

  return {
    p_fake: Number(pFake.toFixed(5)),
    p_real: Number((1.0 - pFake).toFixed(5)),
    fake_indices: mapping.fakeIndices,
    real_indices: mapping.realIndices,
    id2label: mapping.id2label,
    model_name: modelConfig.modelName,
    probabilities: probs,
    probabilities_per_label: probabilitiesPerLabel,
    raw_logits: isLogits ? rawOutput : null
  };
}

module.exports = {
  MODEL_CONFIGS,
  printAllModelConfigs,
  resolveLabelMapping,
  softmax,
  computeProbFake
};
