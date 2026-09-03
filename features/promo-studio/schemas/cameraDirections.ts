export const PROMO_CAMERA_MOVEMENT_IDS = [
  'static',
  'pan_right', 'pan_left', 'whip_pan_right', 'whip_pan_left', 'tilt_up', 'tilt_down',
  'slow_zoom_in', 'slow_zoom_out', 'fast_zoom_in', 'fast_zoom_out', 'crash_zoom_in', 'crash_zoom_out',
  'dolly_in', 'dolly_out', 'truck_right', 'truck_left', 'pedestal_up', 'pedestal_down',
  'slider_right', 'slider_left', 'push_past', 'arc_right', 'arc_left',
  'orbit_clockwise', 'orbit_counterclockwise', 'tracking', 'follow', 'reverse_tracking',
  'side_tracking', 'low_tracking', 'vehicle_tracking', 'chase',
  'handheld', 'snorricam',
  'crane_up', 'crane_down', 'drone_push_in', 'drone_pull_back', 'helicopter',
  'first_person', 'tilt_shift', 'infinite_zoom', 'earth_zoom_out', 'time_lapse', 'pass_through',
] as const;

export type PromoCameraMovementId = typeof PROMO_CAMERA_MOVEMENT_IDS[number];
export type PromoCameraCategory = 'locked' | 'pan_tilt' | 'lens' | 'dolly_track' | 'physical' | 'human' | 'aerial' | 'special';
export type PromoCameraExecution = 'source_generation' | 'post_production' | 'capture' | 'reference_only';
export type PromoCameraSpeed = 'still' | 'slow' | 'moderate' | 'fast' | 'adaptive';

export interface PromoCameraMovementDefinition {
  id: PromoCameraMovementId;
  label: string;
  category: PromoCameraCategory;
  instruction: string;
  supported_executions: readonly PromoCameraExecution[];
}

const movement = (
  id: PromoCameraMovementId,
  label: string,
  category: PromoCameraCategory,
  instruction: string,
  supported_executions: readonly PromoCameraExecution[] = ['source_generation'],
): PromoCameraMovementDefinition => ({ id, label, category, instruction, supported_executions });

// Provider-neutral creative vocabulary. Provider adapters may translate these
// semantics, but provider names, model IDs, and raw vendor prompt fragments do
// not belong in the immutable Promo Manifest.
export const PROMO_CAMERA_MOVEMENTS: readonly PromoCameraMovementDefinition[] = [
  movement('static', 'Static shot', 'locked', 'Hold the camera position and composition steady from start to finish.', ['source_generation', 'post_production', 'capture']),
  movement('pan_right', 'Pan right', 'pan_tilt', 'Rotate the view horizontally toward the right and settle on a readable frame.'),
  movement('pan_left', 'Pan left', 'pan_tilt', 'Rotate the view horizontally toward the left and settle on a readable frame.'),
  movement('whip_pan_right', 'Whip pan right', 'pan_tilt', 'Snap rapidly toward a new subject on the right, with a clean landing frame.'),
  movement('whip_pan_left', 'Whip pan left', 'pan_tilt', 'Snap rapidly toward a new subject on the left, with a clean landing frame.'),
  movement('tilt_up', 'Tilt up', 'pan_tilt', 'Rotate the view upward while maintaining a clear vertical subject relationship.'),
  movement('tilt_down', 'Tilt down', 'pan_tilt', 'Rotate the view downward while maintaining a clear vertical subject relationship.'),
  movement('slow_zoom_in', 'Slow zoom in', 'lens', 'Gradually tighten the lens framing around the primary subject.'),
  movement('slow_zoom_out', 'Slow zoom out', 'lens', 'Gradually widen the lens framing to reveal more context.'),
  movement('fast_zoom_in', 'Fast zoom in', 'lens', 'Tighten the lens framing quickly and finish on a stable close composition.'),
  movement('fast_zoom_out', 'Fast zoom out', 'lens', 'Widen the lens framing quickly and finish on a stable contextual composition.'),
  movement('crash_zoom_in', 'Crash zoom in', 'lens', 'Use an abrupt, emphatic lens push toward the visual target.'),
  movement('crash_zoom_out', 'Crash zoom out', 'lens', 'Use an abrupt, emphatic lens pull away from the visual target.'),
  movement('dolly_in', 'Dolly in', 'dolly_track', 'Move the camera physically forward while preserving subject placement and lens direction.'),
  movement('dolly_out', 'Dolly out', 'dolly_track', 'Move the camera physically backward while preserving subject placement and lens direction.'),
  movement('truck_right', 'Truck right', 'physical', 'Translate the camera laterally to the right without changing its facing direction.'),
  movement('truck_left', 'Truck left', 'physical', 'Translate the camera laterally to the left without changing its facing direction.'),
  movement('pedestal_up', 'Pedestal up', 'physical', 'Raise the entire camera vertically while keeping the lens level.'),
  movement('pedestal_down', 'Pedestal down', 'physical', 'Lower the entire camera vertically while keeping the lens level.'),
  movement('slider_right', 'Slider right', 'physical', 'Make a short controlled slide to the right to introduce restrained parallax.'),
  movement('slider_left', 'Slider left', 'physical', 'Make a short controlled slide to the left to introduce restrained parallax.'),
  movement('push_past', 'Push past', 'physical', 'Travel forward past a foreground edge and reveal the space beyond.'),
  movement('arc_right', 'Arc right', 'physical', 'Move on a shallow rightward curve around the primary subject.'),
  movement('arc_left', 'Arc left', 'physical', 'Move on a shallow leftward curve around the primary subject.'),
  movement('orbit_clockwise', 'Orbit clockwise', 'physical', 'Circle clockwise around the subject at a consistent radius.'),
  movement('orbit_counterclockwise', 'Orbit counterclockwise', 'physical', 'Circle counterclockwise around the subject at a consistent radius.'),
  movement('tracking', 'Tracking shot', 'dolly_track', 'Travel with the moving subject while maintaining readable framing.'),
  movement('follow', 'Follow shot', 'dolly_track', 'Follow behind the subject and keep the route ahead legible.'),
  movement('reverse_tracking', 'Reverse tracking', 'dolly_track', 'Move backward in front of the advancing subject while preserving face and body framing.'),
  movement('side_tracking', 'Side tracking', 'dolly_track', 'Move parallel to the subject and maintain a stable side or three-quarter view.'),
  movement('low_tracking', 'Low tracking', 'dolly_track', 'Track the action from a low camera height near the ground plane.'),
  movement('vehicle_tracking', 'Vehicle tracking', 'dolly_track', 'Match a vehicle or fast-moving object while the environment moves behind it.'),
  movement('chase', 'Chase shot', 'dolly_track', 'Follow fast action with deliberately energetic, responsive reframing.'),
  movement('handheld', 'Handheld', 'human', 'Use restrained operator sway and micro-adjustments while keeping the subject readable.'),
  movement('snorricam', 'Body-mounted / Snorricam', 'human', 'Lock the camera relative to the subject so the background moves around them.'),
  movement('crane_up', 'Crane up', 'aerial', 'Rise smoothly through space and finish at a visibly higher scale.'),
  movement('crane_down', 'Crane down', 'aerial', 'Descend smoothly through space toward the subject or destination.'),
  movement('drone_push_in', 'Drone push in', 'aerial', 'Fly forward on a controlled aerial path toward the destination.'),
  movement('drone_pull_back', 'Drone pull back', 'aerial', 'Fly backward on a controlled aerial path to reveal the wider setting.'),
  movement('helicopter', 'Helicopter shot', 'aerial', 'Follow a broad high-altitude path with stable wide-scale framing.'),
  movement('first_person', 'First-person view', 'special', 'Move from the character viewpoint with body edges available as physical reference.'),
  movement('tilt_shift', 'Tilt-shift', 'special', 'Use a high angled view with a narrow focus band that suggests miniature scale.'),
  movement('infinite_zoom', 'Infinite zoom', 'special', 'Continue moving inward through a centered visual target into a new visual layer.'),
  movement('earth_zoom_out', 'Earth zoom out', 'special', 'Expand rapidly from the local subject toward a planetary-scale view.'),
  movement('time_lapse', 'Time-lapse', 'special', 'Keep the camera locked while compressing visible change over time.'),
  movement('pass_through', 'Pass through', 'special', 'Move through a centered surface or opening and arrive in the revealed space.'),
] as const;

export const PROMO_CAMERA_MOVEMENT_BY_ID = new Map(PROMO_CAMERA_MOVEMENTS.map(item => [item.id, item]));

export interface PromoCameraDirection {
  movement: PromoCameraMovementId;
  execution: PromoCameraExecution;
  speed: PromoCameraSpeed;
  framing: string;
  end_frame: string;
  subject_action: string | null;
  mood: string | null;
}

export function buildPromoCameraPrompt(direction: PromoCameraDirection): string {
  const definition = PROMO_CAMERA_MOVEMENT_BY_ID.get(direction.movement);
  if (!definition) throw new Error(`Unknown Promo camera movement: ${direction.movement}`);
  if (!definition.supported_executions.includes(direction.execution) && direction.execution !== 'reference_only') {
    throw new Error(`${definition.label} is not supported for ${direction.execution.replace(/_/g, ' ')}.`);
  }
  return [
    `Camera movement: ${definition.label}.`,
    definition.instruction,
    `Speed: ${direction.speed}.`,
    `Framing: ${direction.framing.trim()}.`,
    `End frame: ${direction.end_frame.trim()}.`,
    direction.subject_action?.trim() ? `Subject action: ${direction.subject_action.trim()}.` : '',
    direction.mood?.trim() ? `Mood: ${direction.mood.trim()}.` : '',
  ].filter(Boolean).join(' ');
}
