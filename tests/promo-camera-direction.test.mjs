import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPromoCameraPrompt, PROMO_CAMERA_MOVEMENTS, PROMO_CAMERA_MOVEMENT_IDS,
} from '../features/promo-studio/schemas/cameraDirections.ts';

test('camera catalog exposes the complete bounded movement vocabulary', () => {
  assert.equal(PROMO_CAMERA_MOVEMENT_IDS.length, 46);
  assert.equal(PROMO_CAMERA_MOVEMENTS.length, 46);
  assert.equal(new Set(PROMO_CAMERA_MOVEMENT_IDS).size, 46);
  assert.ok(PROMO_CAMERA_MOVEMENT_IDS.includes('static'));
  assert.ok(PROMO_CAMERA_MOVEMENT_IDS.includes('orbit_clockwise'));
  assert.ok(PROMO_CAMERA_MOVEMENT_IDS.includes('pass_through'));
});

test('camera prompt keeps motion, framing, action, and mood as separate semantics', () => {
  const prompt = buildPromoCameraPrompt({
    movement: 'slow_zoom_in', execution: 'source_generation', speed: 'slow',
    framing: 'Keep the product interface centered', end_frame: 'Land on the primary action',
    subject_action: 'The cursor reveals the saved collection', mood: 'Warm and deliberate',
  });
  assert.match(prompt, /Camera movement: Slow zoom in/);
  assert.match(prompt, /Framing: Keep the product interface centered/);
  assert.match(prompt, /Subject action: The cursor reveals the saved collection/);
  assert.doesNotMatch(prompt, /Kling|Runway|fal|Higgsfield/i);
});

test('unsupported execution claims fail closed', () => {
  assert.throws(() => buildPromoCameraPrompt({
    movement: 'orbit_clockwise', execution: 'post_production', speed: 'moderate',
    framing: 'Keep the subject centered', end_frame: 'Finish on the reverse angle', subject_action: null, mood: null,
  }), /not supported for post production/i);
});
