/**
 * The built-in exercise library: everything the app needs to coach a move.
 *
 * Content lives in code (not Notion) because it is the same for everyone and
 * must work offline at home with no signal. Photos are start/end frames from
 * free-exercise-db (released under the Unlicense); `goblet-squat` and
 * `bird-dog` are simple drawings made for this app because that dataset has
 * no photos of them.
 */

export type LoadType =
  /** One dumbbell (goblet hold, one-arm moves). */
  | "single"
  /** A matching pair, one in each hand. */
  | "pair"
  /** Bodyweight only. */
  | "none";

export type ExerciseDef = {
  id: string;
  name: string;
  /** Reps are counted, or a hold is timed. */
  kind: "reps" | "timed";
  load: LoadType;
  /** One arm or leg at a time: the target applies to each side. */
  perSide?: boolean;
  /** Starts with no dumbbell; weight is added once bodyweight gets easy. */
  bodyweightStart?: boolean;
  /** A sensible first guess (kg per dumbbell) for a beginner finding their weight. */
  startGuess?: number;
  muscles: string[];
  /** Start and end position, in that order. Empty when there is no picture. */
  images: string[];
  /** Explains a difference between the picture and how to do it at home. */
  imageNote?: string;
  cues: string[];
  mistakes: string[];
  /** Lower-back guidance, shown prominently when back care is switched on. */
  back?: string;
  /** YouTube search terms for a demo video. */
  video: string;
};

const photos = (folder: string) => [`/exercises/${folder}/0.webp`, `/exercises/${folder}/1.webp`];
const drawing = (folder: string) => [`/exercises/${folder}/0.svg`, `/exercises/${folder}/1.svg`];

const LIST: ExerciseDef[] = [
  /* ---------------------------------------------------------------- *
   * Strength
   * ---------------------------------------------------------------- */
  {
    id: "goblet-squat",
    name: "Goblet squat",
    kind: "reps",
    load: "single",
    startGuess: 6,
    muscles: ["Thighs", "Glutes", "Core"],
    images: drawing("goblet-squat"),
    cues: [
      "Hold one dumbbell upright against your chest, elbows pointing down.",
      "Feet shoulder-width apart, toes turned out a little.",
      "Sit down between your heels with your chest up and knees following your toes.",
      "Go as low as you can with a flat back, then stand up by pushing the floor away.",
    ],
    mistakes: [
      "Heels lifting — keep your weight over the middle of your feet.",
      "Knees caving in — push them out over your toes.",
    ],
    back: "Brace your stomach before each rep and only go as deep as your lower back stays flat. Squatting down to a chair is a good way to start.",
    video: "goblet squat dumbbell form beginner",
  },
  {
    id: "floor-press",
    name: "Floor press",
    kind: "reps",
    load: "pair",
    startGuess: 5,
    muscles: ["Chest", "Triceps", "Shoulders"],
    images: photos("floor-press"),
    cues: [
      "Lie on your mat with knees bent, a dumbbell in each hand above your chest.",
      "Lower until your upper arms touch the floor, elbows about 45° from your body.",
      "Pause lightly, then press straight up until your arms are straight.",
    ],
    mistakes: [
      "Bouncing your elbows off the floor.",
      "Elbows flared straight out to the sides — keep them angled toward your hips.",
    ],
    back: "The floor supports your whole back, which makes this one of the safest pressing moves when your back is sore. Keep your feet flat and don't arch.",
    video: "dumbbell floor press form",
  },
  {
    id: "floor-press-one-arm",
    name: "One-arm floor press",
    kind: "reps",
    load: "single",
    perSide: true,
    startGuess: 5,
    muscles: ["Chest", "Triceps", "Core"],
    images: photos("floor-press"),
    imageNote: "The photo shows both arms. Press one dumbbell at a time and rest the other hand on your stomach.",
    cues: [
      "Lie on your mat with knees bent, the dumbbell above your chest in one hand.",
      "Lower until your upper arm touches the floor, elbow angled toward your hip.",
      "Press back up without letting your body roll. Finish all reps, then switch arms.",
    ],
    mistakes: ["Twisting your hips to help the press.", "Bouncing your elbow off the floor."],
    back: "Your back stays supported by the floor. Keep both feet flat to stop your body rolling.",
    video: "single arm dumbbell floor press",
  },
  {
    id: "bench-press",
    name: "Bench press",
    kind: "reps",
    load: "pair",
    startGuess: 6,
    muscles: ["Chest", "Triceps", "Shoulders"],
    images: photos("bench-press"),
    cues: [
      "Lie on the bench with feet flat, a dumbbell in each hand at chest level.",
      "Press up until your arms are straight, dumbbells over your chest.",
      "Lower slowly until your elbows are just below the bench, then press again.",
    ],
    mistakes: ["Lifting your hips off the bench.", "Dropping the dumbbells too fast at the bottom."],
    back: "If your lower back arches off the bench, put your feet up on the bench instead.",
    video: "dumbbell bench press form beginner",
  },
  {
    id: "one-arm-row",
    name: "One-arm row",
    kind: "reps",
    load: "single",
    perSide: true,
    startGuess: 6,
    muscles: ["Upper back", "Lats", "Biceps"],
    images: photos("one-arm-row"),
    imageNote: "The photo uses a bench. A sturdy chair, sofa or bed edge works the same.",
    cues: [
      "Put one hand and knee on a sturdy chair or sofa, back flat like a table.",
      "Let the dumbbell hang straight down below your shoulder.",
      "Pull it up to your hip with your elbow close to your body, then lower slowly.",
      "Finish all reps on one side, then switch.",
    ],
    mistakes: [
      "Twisting your body to swing the weight up.",
      "Shrugging your shoulder toward your ear.",
    ],
    back: "Leaning on your hand takes load off your lower back. Keep your back flat and still — only the arm moves.",
    video: "one arm dumbbell row form",
  },
  {
    id: "glute-bridge",
    name: "Glute bridge",
    kind: "reps",
    load: "single",
    bodyweightStart: true,
    muscles: ["Glutes", "Hamstrings", "Lower back"],
    images: photos("glute-bridge"),
    imageNote: "The photo goes a little high. Stop when your knees, hips and shoulders are in a straight line.",
    cues: [
      "Lie on your back, knees bent, feet flat and hip-width apart.",
      "Squeeze your glutes and lift your hips until you are straight from knees to shoulders.",
      "Hold for a second at the top, then lower slowly.",
      "When bodyweight gets easy, rest a dumbbell across your hips.",
    ],
    mistakes: [
      "Arching your lower back to get higher.",
      "Pushing through your toes instead of your heels.",
    ],
    back: "Strong glutes take strain off your lower back. Keep your ribs down and lift with your glutes, not by arching.",
    video: "glute bridge form",
  },
  {
    id: "dead-bug",
    name: "Dead bug",
    kind: "reps",
    load: "none",
    perSide: true,
    muscles: ["Deep core"],
    images: photos("dead-bug"),
    cues: [
      "Lie on your back, arms pointing at the ceiling, knees bent 90° above your hips.",
      "Gently press your lower back into the floor.",
      "Slowly straighten one leg and lower the opposite arm, keeping your back down.",
      "Come back and switch sides. Count the reps on each side.",
    ],
    mistakes: [
      "Lower back lifting off the floor — make the movement smaller.",
      "Rushing — slow, controlled reps work best.",
    ],
    back: "One of the best core moves for back pain: it trains your stomach to keep your spine still while your arms and legs move.",
    video: "dead bug exercise form",
  },
  {
    id: "romanian-deadlift",
    name: "Romanian deadlift",
    kind: "reps",
    load: "pair",
    startGuess: 5,
    muscles: ["Hamstrings", "Glutes", "Lower back"],
    images: photos("romanian-deadlift"),
    cues: [
      "Stand tall holding the dumbbells in front of your thighs, knees slightly bent.",
      "Push your hips back as if closing a door behind you, sliding the dumbbells down your legs.",
      "Keep your back flat. Stop when you feel a stretch in the back of your thighs — around knee or mid-shin height.",
      "Squeeze your glutes to stand back up.",
    ],
    mistakes: [
      "Rounding your back to reach lower.",
      "Bending your knees into a squat instead of pushing your hips back.",
    ],
    back: "This is the move that makes your lower back stronger. Start light, brace your stomach, and only lower as far as your back stays flat. Sharp pain means stop and log it in the back check.",
    video: "dumbbell romanian deadlift form beginner",
  },
  {
    id: "romanian-deadlift-single",
    name: "Romanian deadlift (one dumbbell)",
    kind: "reps",
    load: "single",
    startGuess: 8,
    muscles: ["Hamstrings", "Glutes", "Lower back"],
    images: photos("romanian-deadlift"),
    imageNote: "The photo uses two dumbbells. Hold one dumbbell by both ends in front of your thighs.",
    cues: [
      "Hold one dumbbell by both ends in front of your thighs, knees slightly bent.",
      "Push your hips back, sliding the dumbbell down your legs with a flat back.",
      "Stop when you feel a stretch in the back of your thighs, then squeeze your glutes to stand.",
    ],
    mistakes: ["Rounding your back to reach lower.", "Turning it into a squat."],
    back: "Start light and only lower as far as your back stays flat. Brace your stomach before each rep.",
    video: "single dumbbell romanian deadlift form",
  },
  {
    id: "split-squat",
    name: "Split squat",
    kind: "reps",
    load: "pair",
    perSide: true,
    bodyweightStart: true,
    muscles: ["Thighs", "Glutes"],
    images: photos("split-squat"),
    cues: [
      "Take a long step forward and stand tall, back heel lifted.",
      "Lower straight down until your back knee nearly touches the floor.",
      "Push through your front foot to come up. Finish all reps, then switch legs.",
      "Start without weight; hold dumbbells at your sides once it feels easy.",
    ],
    mistakes: ["Leaning forward over the front knee.", "A step so short that your front heel lifts."],
    back: "Stay upright with your stomach braced — this works your legs hard without loading your back much. Hold a wall or chair for balance if you need to.",
    video: "dumbbell split squat form beginner",
  },
  {
    id: "split-squat-goblet",
    name: "Split squat (one dumbbell)",
    kind: "reps",
    load: "single",
    perSide: true,
    bodyweightStart: true,
    muscles: ["Thighs", "Glutes"],
    images: photos("split-squat"),
    imageNote: "The photo uses two dumbbells. Hold one dumbbell upright against your chest instead.",
    cues: [
      "Hold the dumbbell against your chest and take a long step forward.",
      "Lower straight down until your back knee nearly touches the floor.",
      "Push through your front foot to stand. Finish all reps, then switch legs.",
    ],
    mistakes: ["Leaning forward over the front knee.", "Letting the front knee cave inward."],
    back: "Stay tall with your stomach braced. Use a wall for balance if needed.",
    video: "goblet split squat form",
  },
  {
    id: "shoulder-press",
    name: "One-arm shoulder press",
    kind: "reps",
    load: "single",
    perSide: true,
    startGuess: 4.5,
    muscles: ["Shoulders", "Triceps", "Core"],
    images: photos("shoulder-press"),
    imageNote: "The photo shows the standing version. Kneeling on one knee is easier on your back.",
    cues: [
      "Kneel on one knee (or stand tall) with the dumbbell at your shoulder.",
      "Brace your stomach and squeeze your glutes.",
      "Press straight up until your arm is straight, then lower slowly to your shoulder.",
      "Finish all reps, then switch arms.",
    ],
    mistakes: ["Leaning back to push the weight up.", "Ribs flaring and lower back arching."],
    back: "Kneeling on one knee locks your hips so your lower back can't arch — the safest way to press overhead with back pain.",
    video: "half kneeling single arm dumbbell press",
  },
  {
    id: "bird-dog",
    name: "Bird dog",
    kind: "reps",
    load: "none",
    perSide: true,
    muscles: ["Lower back", "Glutes", "Core"],
    images: drawing("bird-dog"),
    cues: [
      "On hands and knees: hands under shoulders, knees under hips, back flat.",
      "Slowly reach one arm forward and the opposite leg back until both are level with your back.",
      "Hold for 2 seconds without your hips tipping, then return. Alternate sides.",
    ],
    mistakes: [
      "Lifting the leg too high, which arches your back.",
      "Rushing — imagine a glass of water balanced on your lower back.",
    ],
    back: "Used by back specialists to train the muscles that hold your spine steady. Keep it slow and small at first.",
    video: "bird dog exercise form",
  },
  {
    id: "side-plank",
    name: "Side plank",
    kind: "timed",
    load: "none",
    perSide: true,
    muscles: ["Obliques", "Lower back"],
    images: photos("side-plank"),
    cues: [
      "Lie on your side with your elbow right under your shoulder.",
      "Bend your knees for an easier version, or keep your legs straight.",
      "Lift your hips so your body makes a straight line, and hold.",
      "Breathe normally, then switch sides.",
    ],
    mistakes: ["Hips sagging toward the floor.", "Rolling forward or backward."],
    back: "Strengthens the muscles along the side of your spine that keep it stable. If straight legs hurt, hold it from your knees.",
    video: "side plank from knees beginner",
  },

  /* ---------------------------------------------------------------- *
   * Harder variations, offered by the 4-week review once a lift tops out
   * ---------------------------------------------------------------- */
  {
    id: "bulgarian-split-squat",
    name: "Bulgarian split squat",
    kind: "reps",
    load: "single",
    perSide: true,
    bodyweightStart: true,
    muscles: ["Thighs", "Glutes"],
    images: photos("bulgarian-split-squat"),
    imageNote: "The photo uses a barbell and a bench. At home, rest your back foot on a chair or sofa and hold one dumbbell at your chest.",
    cues: [
      "Stand a big step in front of a chair or sofa and rest the top of your back foot on it.",
      "Hold the dumbbell upright against your chest (or start with no weight).",
      "Lower straight down until your front thigh is about level, then push through your front heel to stand.",
      "Finish all reps on one leg, then switch.",
    ],
    mistakes: ["Standing too close to the chair, so the front knee shoots forward.", "Leaning forward to get lower."],
    back: "Stay tall with your stomach braced; the back leg only helps you balance. Hold a wall if you wobble.",
    video: "bulgarian split squat dumbbell form",
  },
  {
    id: "single-leg-rdl",
    name: "Single-leg Romanian deadlift",
    kind: "reps",
    load: "single",
    perSide: true,
    startGuess: 6,
    muscles: ["Hamstrings", "Glutes", "Lower back", "Balance"],
    images: photos("single-leg-rdl"),
    imageNote: "The photo uses a kettlebell. A dumbbell works the same — hold it in the hand opposite the standing leg.",
    cues: [
      "Stand on one leg with a slight bend in the knee, dumbbell in the opposite hand.",
      "Hinge at the hip, letting the free leg swing back in line with your body.",
      "Lower until you feel a stretch in the back of the standing leg, back flat, hips level.",
      "Squeeze the glute of the standing leg to come up. Finish all reps, then switch.",
    ],
    mistakes: ["Opening the hip so the back leg rotates outward.", "Rounding your back to reach lower."],
    back: "Keep it slow and light at first — balance is part of the exercise. Touch a wall with your free hand if needed.",
    video: "single leg romanian deadlift dumbbell form",
  },
  {
    id: "single-leg-glute-bridge",
    name: "Single-leg glute bridge",
    kind: "reps",
    load: "single",
    perSide: true,
    bodyweightStart: true,
    muscles: ["Glutes", "Hamstrings", "Lower back"],
    images: photos("single-leg-glute-bridge"),
    cues: [
      "Lie on your back with one foot flat and the other leg straight up or held in the air.",
      "Push through the heel of the planted foot and lift your hips until they're level.",
      "Hold for a second, lower slowly. Finish all reps, then switch legs.",
      "Once that's easy, rest a dumbbell across your hips.",
    ],
    mistakes: ["Hips tipping toward the lifted leg.", "Arching your lower back instead of squeezing your glute."],
    back: "Keep your ribs down and your hips level — it's your glutes doing the work, not your back.",
    video: "single leg glute bridge form",
  },

  /* ---------------------------------------------------------------- *
   * Warm-up and back care
   * ---------------------------------------------------------------- */
  {
    id: "march",
    name: "March in place",
    kind: "timed",
    load: "none",
    muscles: ["Whole body"],
    images: [],
    cues: ["Lift your knees toward hip height and swing your arms.", "Breathe steadily and stand tall."],
    mistakes: ["Leaning back as your knees come up."],
    video: "march in place warm up",
  },
  {
    id: "arm-circles",
    name: "Arm circles",
    kind: "timed",
    load: "none",
    muscles: ["Shoulders"],
    images: photos("arm-circles"),
    cues: ["Arms straight out to the sides.", "Start with small circles and make them bigger.", "Switch direction halfway."],
    mistakes: ["Shrugging your shoulders up."],
    video: "arm circles warm up",
  },
  {
    id: "cat-cow",
    name: "Cat-cow",
    kind: "timed",
    load: "none",
    muscles: ["Spine mobility"],
    images: photos("cat-cow"),
    cues: [
      "On hands and knees, slowly round your back up toward the ceiling, chin tucked.",
      "Then let your stomach gently sink and look slightly forward.",
      "Move slowly with your breathing and stay in a comfortable range.",
    ],
    mistakes: ["Forcing the end positions.", "Moving fast."],
    back: "Gentle movement eases stiffness. Stay in a pain-free range.",
    video: "cat cow stretch",
  },
  {
    id: "hip-hinge",
    name: "Hip hinge drill",
    kind: "timed",
    load: "none",
    muscles: ["Hamstrings", "Glutes"],
    images: photos("romanian-deadlift"),
    imageNote: "Same movement as the Romanian deadlift, without dumbbells — hands on your hips.",
    cues: [
      "Hands on your hips, knees slightly bent.",
      "Push your hips back until you feel a stretch in the back of your thighs, back flat.",
      "Squeeze your glutes to stand tall.",
    ],
    mistakes: ["Rounding your back.", "Squatting down instead of pushing your hips back."],
    back: "Practising this pattern teaches you to bend with your hips instead of your lower back — useful for lifting anything.",
    video: "hip hinge drill",
  },
  {
    id: "bodyweight-squat",
    name: "Bodyweight squat",
    kind: "timed",
    load: "none",
    muscles: ["Thighs", "Glutes"],
    images: photos("bodyweight-squat"),
    cues: ["Feet shoulder-width apart.", "Sit back and down as if onto a chair, chest up.", "Stand back up by pushing the floor away."],
    mistakes: ["Heels lifting.", "Knees caving in."],
    back: "Put a chair behind you to set a comfortable depth.",
    video: "bodyweight squat form",
  },
  {
    id: "knee-to-chest",
    name: "Knee to chest stretch",
    kind: "timed",
    load: "none",
    perSide: true,
    muscles: ["Lower back", "Glutes"],
    images: photos("knee-to-chest"),
    cues: ["Lie on your back.", "Gently pull one knee toward your chest and hold.", "Keep the other leg relaxed and breathe slowly."],
    mistakes: ["Pulling hard enough to hurt."],
    back: "A gentle stretch for the lower back. It should feel relieving, never painful.",
    video: "single knee to chest stretch",
  },
  {
    id: "hip-flexor-stretch",
    name: "Hip flexor stretch",
    kind: "timed",
    load: "none",
    perSide: true,
    muscles: ["Hip flexors"],
    images: photos("hip-flexor-stretch"),
    cues: [
      "Kneel on one knee with the other foot in front.",
      "Squeeze the glute of the back leg and shift forward slightly until you feel a stretch at the front of the hip.",
      "Stay upright — don't arch your back.",
    ],
    mistakes: ["Arching your lower back to go further."],
    back: "Tight hip flexors pull on the lower back from the front; this stretch eases that.",
    video: "kneeling hip flexor stretch",
  },
  {
    id: "childs-pose",
    name: "Child's pose",
    kind: "timed",
    load: "none",
    muscles: ["Lower back", "Hips"],
    images: photos("childs-pose"),
    cues: ["Kneel and sit back toward your heels.", "Reach your arms forward and rest your forehead down.", "Breathe slowly into your back."],
    mistakes: ["Forcing your hips down to your heels."],
    back: "A relaxing stretch to finish with.",
    video: "child's pose stretch",
  },
];

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries(
  LIST.map((exercise) => [exercise.id, exercise]),
);

export const EXERCISE_LIST: readonly ExerciseDef[] = LIST;

/**
 * Where to go once a lift has topped out on your dumbbells: a variation that
 * makes the same weight much harder (one leg, one arm).
 */
export const HARDER: Readonly<Record<string, string>> = {
  "goblet-squat": "bulgarian-split-squat",
  "split-squat": "bulgarian-split-squat",
  "split-squat-goblet": "bulgarian-split-squat",
  "romanian-deadlift": "single-leg-rdl",
  "romanian-deadlift-single": "single-leg-rdl",
  "glute-bridge": "single-leg-glute-bridge",
  "floor-press": "floor-press-one-arm",
};

/** Unknown ids (renamed in Notion, typo) degrade to a plain bodyweight entry. */
export function getExercise(id: string): ExerciseDef {
  return (
    EXERCISES[id] ?? {
      id,
      name: id,
      kind: "reps",
      load: "none",
      muscles: [],
      images: [],
      cues: [],
      mistakes: [],
      video: id,
    }
  );
}

export function videoUrl(exercise: ExerciseDef): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.video)}`;
}
