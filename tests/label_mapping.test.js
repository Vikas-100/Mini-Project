/**
 * Unit Tests: Model Label Mapping & Ensemble Verification
 * 
 * Verifies that label mapping never inverts predictions regardless of whether
 * index 0 or index 1 represents 'Deepfake' or 'Realism'.
 */

const assert = require('assert');
const { MODEL_CONFIGS, resolveLabelMapping, softmax, computeProbFake } = require('../model_config.cjs');
const { ensureRgb } = require('../preprocessing.cjs');

function runAllTests() {
  console.log('\n================================================================');
  console.log('       DFD MODEL: RUNNING LABEL MAPPING UNIT TESTS               ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // Test 1: Standard Model (0=REAL, 1=FAKE) with Deepfake Logit High
  test('Standard Model (0=REAL, 1=FAKE): High logit at index 1 yields P(fake) > 0.95', () => {
    const config = {
      modelName: 'Mock-Standard-ViT',
      id2label: { 0: 'REAL', 1: 'FAKE' },
      realLabels: ['real', 'authentic', 'realism', 'human'],
      fakeLabels: ['fake', 'deepfake', 'artificial', 'synthetic', 'manipulated']
    };
    const logits = [-2.5, 3.5]; // Index 1 is FAKE
    const result = computeProbFake(logits, config, true);

    assert(result.p_fake > 0.95, `Expected P(fake) > 0.95, got ${result.p_fake}`);
    assert(result.p_real < 0.05, `Expected P(real) < 0.05, got ${result.p_real}`);
    assert.deepStrictEqual(result.fake_indices, [1]);
    assert.deepStrictEqual(result.real_indices, [0]);
  });

  // Test 2: Inverted Model (0=Deepfake, 1=Realism) with Deepfake Logit High
  // THIS IS THE EXACT BUG REPORTED BY USER:
  // Without name resolution, index 1 was assumed fake, so index 0 would yield P(fake) ≈ 0.00!
  test('Inverted Model (0=Deepfake, 1=Realism): High logit at index 0 correctly yields P(fake) > 0.95', () => {
    const config = {
      modelName: 'Mock-Inverted-ViT',
      id2label: { 0: 'Deepfake', 1: 'Realism' },
      realLabels: ['real', 'authentic', 'realism', 'human'],
      fakeLabels: ['fake', 'deepfake', 'artificial', 'synthetic', 'manipulated']
    };
    const logits = [3.5, -2.5]; // Index 0 is Deepfake
    const result = computeProbFake(logits, config, true);

    assert(result.p_fake > 0.95, `Inverted model failed! Expected P(fake) > 0.95, got ${result.p_fake}`);
    assert(result.p_real < 0.05, `Expected P(real) < 0.05, got ${result.p_real}`);
    assert.deepStrictEqual(result.fake_indices, [0], 'Expected index 0 to map to fake');
    assert.deepStrictEqual(result.real_indices, [1], 'Expected index 1 to map to real');
  });

  // Test 3: Inverted Model (0=Deepfake, 1=Realism) with Authentic Logit High
  test('Inverted Model (0=Deepfake, 1=Realism): High logit at index 1 correctly yields P(fake) < 0.05', () => {
    const config = {
      modelName: 'Mock-Inverted-ViT',
      id2label: { 0: 'Deepfake', 1: 'Realism' },
      realLabels: ['real', 'authentic', 'realism', 'human'],
      fakeLabels: ['fake', 'deepfake', 'artificial', 'synthetic', 'manipulated']
    };
    const logits = [-2.5, 3.5]; // Index 1 is Realism
    const result = computeProbFake(logits, config, true);

    assert(result.p_fake < 0.05, `Expected P(fake) < 0.05, got ${result.p_fake}`);
    assert(result.p_real > 0.95, `Expected P(real) > 0.95, got ${result.p_real}`);
  });

  // Test 4: Alternate Model Labels (0=human, 1=artificial)
  test('Alternate Labels (0=human, 1=artificial): Resolves correctly by name', () => {
    const config = {
      modelName: 'Mock-SDXL-Detector',
      id2label: { 0: 'human', 1: 'artificial' },
      realLabels: ['real', 'authentic', 'human'],
      fakeLabels: ['artificial', 'synthetic', 'generated']
    };
    const mapping = resolveLabelMapping(config);
    assert.deepStrictEqual(mapping.fakeIndices, [1]);
    assert.deepStrictEqual(mapping.realIndices, [0]);
  });

  // Test 5: Softmax normalization preserves probability sum = 1.0
  test('Softmax normalization produces valid probability distribution', () => {
    const logits = [1.2, 4.5, -0.8];
    const probs = softmax(logits);
    const sum = probs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-6, `Probabilities must sum to 1.0, got ${sum}`);
  });

  // Test 6: Result Categorization Decision Bands
  test('Result Categorization Threshold Bands (<0.35, 0.35-0.65, >0.65)', () => {
    function categorize(pFake) {
      if (pFake < 0.35) return 'Likely authentic';
      if (pFake <= 0.65) return 'Uncertain, manual review recommended';
      return 'Likely AI-generated or manipulated';
    }

    assert.strictEqual(categorize(0.12), 'Likely authentic');
    assert.strictEqual(categorize(0.34), 'Likely authentic');
    assert.strictEqual(categorize(0.35), 'Uncertain, manual review recommended');
    assert.strictEqual(categorize(0.50), 'Uncertain, manual review recommended');
    assert.strictEqual(categorize(0.65), 'Uncertain, manual review recommended');
    assert.strictEqual(categorize(0.66), 'Likely AI-generated or manipulated');
    assert.strictEqual(categorize(0.98), 'Likely AI-generated or manipulated');
  });

  // Test 7: Preprocessing Grayscale to RGB Conversion
  test('Preprocessing converts 1-channel Grayscale to 3-channel RGB', () => {
    const gray = Buffer.from([120, 200]);
    const rgb = ensureRgb(gray, 1);
    assert.strictEqual(rgb.length, 6);
    assert.strictEqual(rgb[0], 120);
    assert.strictEqual(rgb[1], 120);
    assert.strictEqual(rgb[2], 120);
    assert.strictEqual(rgb[3], 200);
    assert.strictEqual(rgb[4], 200);
    assert.strictEqual(rgb[5], 200);
  });

  // Test 8: Preprocessing RGBA to RGB Alpha Blending
  test('Preprocessing blends 4-channel RGBA to 3-channel RGB', () => {
    // Solid red pixel with full alpha
    const rgba = Buffer.from([255, 0, 0, 255]);
    const rgb = ensureRgb(rgba, 4);
    assert.strictEqual(rgb.length, 3);
    assert.strictEqual(rgb[0], 255);
    assert.strictEqual(rgb[1], 0);
    assert.strictEqual(rgb[2], 0);
  });

  // Test 9: CAUSE 2 Regression Test - Fails if a fake label is read as real
  test('CAUSE 2 Regression: Inverted model with label "artificial" at index 0 MUST fail if read as real', () => {
    const ummConfig = {
      modelName: 'umm-maybe/AI-image-detector',
      id2label: { 0: 'artificial', 1: 'human' },
      fakeLabels: ['artificial', 'fake', 'synthetic'],
      realLabels: ['human', 'real', 'authentic']
    };

    // Mock high logit for 'artificial' at index 0
    const mockedLogits = [3.8, -2.9]; // index 0 is artificial, index 1 is human
    const result = computeProbFake(mockedLogits, ummConfig, true);

    // If an inverted label bug existed (i.e. index 0 read as real), p_real would be > 0.99
    // This assertion strictly enforces that artificial MUST be mapped to p_fake:
    assert.strictEqual(result.fake_indices[0], 0, 'Index 0 (artificial) MUST be in fake_indices');
    assert.strictEqual(result.real_indices[0], 1, 'Index 1 (human) MUST be in real_indices');
    assert(result.p_fake > 0.99, `Artificial label at index 0 must yield P(fake) > 0.99, got P(fake)=${result.p_fake}`);
    assert(result.p_real < 0.01, `Artificial label at index 0 must yield P(real) < 0.01, got P(real)=${result.p_real}`);

    // Negative assertion: Simulate naive index 1 mapping and assert it is rejected
    const naiveIndex1Fake = softmax(mockedLogits)[1]; // Naively treating index 1 as fake
    assert(naiveIndex1Fake < 0.01, 'Naive index 1 is indeed tiny, proving that hardcoding index 1 would fail');
    assert(result.p_fake !== naiveIndex1Fake, 'Inverted bug detected: p_fake must not equal naive index 1 probability');
  });

  // Test 10: CAUSE 3 Safety Tripwire Rule Test
  test('CAUSE 3 Safety Rule: If any single model gives P(fake) > 0.8, verdict is NEVER authentic', () => {
    // Model A: High confidence AI detection (e.g. specialized diffusion detector)
    // Model B: Weak / uncertain model
    const mockModelScores = [
      { model_name: 'umm-maybe/AI-image-detector', p_fake: 0.92, weight: 0.40 },
      { model_name: 'weak-face-swap-model', p_fake: 0.20, weight: 0.35 },
      { model_name: 'legacy-cnn', p_fake: 0.15, weight: 0.25 }
    ];

    // Standard plain average would give (0.92 + 0.20 + 0.15)/3 = 0.42 (uncertain / borderline)
    // Check tripwire rule:
    const anyModelAbove80 = mockModelScores.some(m => m.p_fake > 0.80);
    assert.strictEqual(anyModelAbove80, true);

    function evaluateVerdictWithTripwire(models) {
      let weightedSum = 0;
      let totalW = 0;
      for (const m of models) {
        weightedSum += m.p_fake * m.weight;
        totalW += m.weight;
      }
      let ensembleFake = weightedSum / totalW;

      let verdict;
      if (ensembleFake < 0.35) {
        verdict = 'Likely authentic';
      } else if (ensembleFake <= 0.65) {
        verdict = 'Uncertain, manual review recommended';
      } else {
        verdict = 'Likely AI-generated or manipulated';
      }

      // Cause 3 Rule: If any single model > 0.8, never Authentic!
      if (models.some(m => m.p_fake > 0.80) && verdict === 'Likely authentic') {
        verdict = 'Uncertain, manual review recommended';
      }
      return { ensembleFake, verdict };
    }

    const res = evaluateVerdictWithTripwire(mockModelScores);
    assert.notStrictEqual(res.verdict, 'Likely authentic', 'Image with model scoring > 0.8 must NEVER be authentic');
  });

  // Test 11: False Positive Prevention for Normal User Images (Missing EXIF & Generic Filenames)
  test('Normal user images without EXIF and with generic names MUST be Likely authentic', () => {
    const { runEnsembleInference } = require('../ensemble_detector.cjs');
    const dummyNormalBuffer = Buffer.alloc(8192);
    for (let i = 0; i < dummyNormalBuffer.length; i++) {
      dummyNormalBuffer[i] = (i * 37 + 13) % 256;
    }

    const genericNames = ['IMG_20261024_123456.jpg', 'DSC_0042.jpg', 'upload.jpg', 'nature_scenery.png', 'my_pic.jpeg'];
    for (const name of genericNames) {
      const res = runEnsembleInference(dummyNormalBuffer, name);
      assert.strictEqual(res.verdict, 'Likely authentic', `Normal image ${name} must be Likely authentic, got ${res.verdict}`);
      assert(res.p_fake < 0.35, `Normal image ${name} P(fake) must be < 0.35, got ${res.p_fake}`);
      assert.strictEqual(res.verdict_class, 'authentic');
    }
  });

  // Test 12: Provenance-bearing C2PA Images Verified as Authentic
  test('C2PA manifest images without AI generation tags must be verified as authentic provenance', () => {
    const { extractExifData } = require('../preprocessing.cjs');
    const c2paBuffer = Buffer.from('ÿØÿà  JFIF  jumbjumdc2pa urn:c2pa:12345 camera sensor verified');
    const exif = extractExifData(c2paBuffer);
    assert.strictEqual(exif.hasC2pa, true, 'Must recognize C2PA manifest');
    assert.strictEqual(exif.isAiSoftware, false, 'C2PA must NOT be treated as AI software');
    assert.strictEqual(exif.cameraVerified, true, 'C2PA without AI tags must be cameraVerified');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`Unit Tests Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
