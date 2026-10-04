/**
 * The built-in exercise library: everything the app needs to coach a move.
 *
 * Content lives in code (not Notion) because it is the same for everyone and
 * must work offline at home with no signal. Photos are start/end frames from
 * free-exercise-db (released under the Unlicense). The goblet squat, bird dog,
 * carries and dumbbell dead bug are simple drawings made for this app because
 * that dataset has no usable photos of them.
 */

export type LoadType =
  /** One dumbbell (goblet hold, one-arm moves). */
  | "single"
  /** A matching pair, one in each hand. */
  | "pair"
  /** Bodyweight only. */
  | "none";

/** What a move trains, used to offer similar swaps and to group the picker. */
export type Pattern =
  | "squat"
  | "lunge"
  | "hinge"
  | "glutes"
  | "push"
  | "overhead"
  | "pull"
  | "arms"
  | "calves"
  | "core"
  | "mobility";

export const PATTERN_LABELS: Record<Pattern, string> = {
  squat: "Squats",
  lunge: "Lunges and single leg",
  hinge: "Hip hinges",
  glutes: "Glutes",
  push: "Chest",
  overhead: "Shoulders",
  pull: "Upper back",
  arms: "Arms",
  calves: "Calves",
  core: "Core and carries",
  mobility: "Mobility",
};

/** Sets and targets for an exercise added to a workout. */
export type Prescription = {
  sets: number;
  reps?: [number, number];
  seconds?: [number, number];
  rest: number;
};

export type ExerciseDef = {
  id: string;
  name: string;
  pattern: Pattern;
  /** Starting sets and targets when added to a workout; see `prescriptionFor`. */
  prescription?: Prescription;
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
    pattern: "squat",
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
    pattern: "push",
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
    pattern: "push",
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
    pattern: "push",
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
    pattern: "pull",
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
    pattern: "glutes",
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
    pattern: "core",
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
    pattern: "hinge",
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
    pattern: "hinge",
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
    pattern: "lunge",
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
    pattern: "lunge",
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
    pattern: "overhead",
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
    pattern: "core",
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
    pattern: "core",
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
    pattern: "lunge",
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
    pattern: "hinge",
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
    pattern: "glutes",
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
   * More dumbbell moves, for building your own workouts
   * ---------------------------------------------------------------- */
  {
    id: "sumo-squat",
    name: "Sumo squat",
    pattern: "squat",
    kind: "reps",
    load: "single",
    startGuess: 8,
    prescription: { sets: 3, reps: [10, 15], rest: 90 },
    muscles: ["Inner thighs", "Glutes", "Thighs"],
    images: photos("sumo-squat"),
    cues: [
      "Stand with your feet wide and toes turned out, holding one dumbbell by its end between your legs.",
      "Push your knees out and sit straight down, chest up and arms long.",
      "Go as low as your back stays flat, then stand up by squeezing your glutes.",
    ],
    mistakes: ["Knees caving in — push them out over your toes.", "Leaning forward to reach lower."],
    back: "The wide stance keeps your body upright, which is kind to your lower back. Brace before each rep.",
    video: "dumbbell sumo squat form",
  },
  {
    id: "reverse-lunge",
    name: "Reverse lunge",
    pattern: "lunge",
    kind: "reps",
    load: "pair",
    perSide: true,
    bodyweightStart: true,
    prescription: { sets: 3, reps: [8, 12], rest: 90 },
    muscles: ["Thighs", "Glutes"],
    images: photos("reverse-lunge"),
    cues: [
      "Stand tall, a dumbbell in each hand (or none to start).",
      "Take a long step back and lower until your back knee nearly touches the floor.",
      "Push through your front heel to step back up. Finish all reps on one leg, then switch.",
    ],
    mistakes: ["Leaning forward over the front knee.", "Stepping back in a line, like a tightrope — keep your feet hip-width apart."],
    back: "Stepping back is easier on your knees than stepping forward. Stay tall with your stomach braced.",
    video: "dumbbell reverse lunge form",
  },
  {
    id: "step-up",
    name: "Step-up",
    pattern: "lunge",
    kind: "reps",
    load: "pair",
    perSide: true,
    bodyweightStart: true,
    prescription: { sets: 3, reps: [8, 12], rest: 90 },
    muscles: ["Thighs", "Glutes", "Balance"],
    images: photos("step-up"),
    imageNote: "The photo uses a bench. The bottom stair or a solid box works; never a chair that can slide.",
    cues: [
      "Stand facing a stair or sturdy box, dumbbells at your sides (or none to start).",
      "Put your whole foot on the step and push through that heel to stand up on it.",
      "Step down slowly with the same leg leading. Finish all reps, then switch.",
    ],
    mistakes: ["Pushing off the floor with the back foot.", "Letting the front knee cave in."],
    back: "Keep your chest up and step up with your leg, not by leaning forward.",
    video: "dumbbell step up form",
  },
  {
    id: "floor-fly",
    name: "Floor fly",
    pattern: "push",
    kind: "reps",
    load: "pair",
    startGuess: 4.5,
    prescription: { sets: 2, reps: [10, 15], rest: 60 },
    muscles: ["Chest", "Shoulders"],
    images: photos("floor-fly"),
    imageNote: "The photo uses a bench. On the floor your elbows stop at the mat, which protects your shoulders.",
    cues: [
      "Lie on your back, knees bent, dumbbells above your chest with palms facing each other.",
      "With a slight bend in your elbows, open your arms out to the sides until your elbows touch the floor.",
      "Squeeze your chest to bring the dumbbells back together.",
    ],
    mistakes: ["Bending your elbows more and more until it turns into a press.", "Dropping fast into the floor."],
    back: "Lying down with knees bent keeps your back flat and supported.",
    video: "dumbbell floor fly form",
  },
  {
    id: "lateral-raise",
    name: "Lateral raise",
    pattern: "overhead",
    kind: "reps",
    load: "pair",
    startGuess: 2,
    prescription: { sets: 2, reps: [10, 15], rest: 60 },
    muscles: ["Shoulders"],
    images: photos("lateral-raise"),
    cues: [
      "Stand tall with light dumbbells at your sides.",
      "Raise your arms out to the sides, elbows slightly bent, until they're level with your shoulders.",
      "Lower slowly. Light weights are normal here — even the empty handles.",
    ],
    mistakes: ["Swinging the weights up with your body.", "Shrugging your shoulders toward your ears."],
    back: "Stand tall and don't lean back. Sitting on a chair works too.",
    video: "dumbbell lateral raise form",
  },
  {
    id: "reverse-fly",
    name: "Seated reverse fly",
    pattern: "pull",
    kind: "reps",
    load: "pair",
    startGuess: 2,
    prescription: { sets: 2, reps: [10, 15], rest: 60 },
    muscles: ["Upper back", "Rear shoulders"],
    images: photos("reverse-fly"),
    imageNote: "The photo uses a bench. Sit on the edge of a chair the same way.",
    cues: [
      "Sit on the edge of a chair and lean forward until your chest is close to your thighs.",
      "Let light dumbbells hang below you, palms facing each other.",
      "Lift them out to the sides, squeezing your shoulder blades together, then lower slowly.",
    ],
    mistakes: ["Rounding your back.", "Using weights so heavy you have to swing them."],
    back: "Resting your chest towards your thighs supports your back. Keep it flat rather than rounded.",
    video: "seated bent over reverse fly dumbbell",
  },
  {
    id: "dumbbell-curl",
    name: "Biceps curl",
    pattern: "arms",
    kind: "reps",
    load: "pair",
    startGuess: 4.5,
    prescription: { sets: 2, reps: [10, 15], rest: 60 },
    muscles: ["Biceps", "Forearms"],
    images: photos("dumbbell-curl"),
    cues: [
      "Stand tall, a dumbbell in each hand, palms facing forward.",
      "Keep your elbows by your sides and curl the dumbbells up to your shoulders.",
      "Squeeze at the top, then lower slowly all the way down.",
    ],
    mistakes: ["Swinging your body to get the weight up.", "Elbows drifting forward."],
    back: "Brace your stomach and don't lean back. If standing bothers your back, sit on a chair.",
    video: "dumbbell bicep curl form",
  },
  {
    id: "hammer-curl",
    name: "Hammer curl",
    pattern: "arms",
    kind: "reps",
    load: "pair",
    startGuess: 4.5,
    prescription: { sets: 2, reps: [10, 15], rest: 60 },
    muscles: ["Biceps", "Forearms"],
    images: photos("hammer-curl"),
    cues: [
      "Stand tall, a dumbbell in each hand, palms facing your body.",
      "Keep your elbows by your sides and curl the dumbbells up, thumbs leading.",
      "Lower slowly all the way down.",
    ],
    mistakes: ["Swinging your body.", "Letting your wrists bend back."],
    back: "Brace your stomach and stand tall, or sit on a chair.",
    video: "dumbbell hammer curl form",
  },
  {
    id: "floor-triceps-extension",
    name: "Lying triceps extension",
    pattern: "arms",
    kind: "reps",
    load: "pair",
    startGuess: 4.5,
    prescription: { sets: 2, reps: [10, 15], rest: 60 },
    muscles: ["Triceps"],
    images: photos("floor-triceps-extension"),
    imageNote: "The photo uses a bench. Lie on your mat with your knees bent — it's easier on your back.",
    cues: [
      "Lie on your back, knees bent, dumbbells held straight up above your chest.",
      "Keep your upper arms still and bend your elbows to lower the dumbbells beside your head.",
      "Straighten your arms to lift them back up.",
    ],
    mistakes: ["Elbows flaring out wide.", "Lowering fast — control it near your head."],
    back: "Lying on the floor with knees bent keeps your lower back flat and supported.",
    video: "lying dumbbell triceps extension floor",
  },
  {
    id: "calf-raise",
    name: "Calf raise",
    pattern: "calves",
    kind: "reps",
    load: "pair",
    bodyweightStart: true,
    prescription: { sets: 2, reps: [12, 20], rest: 45 },
    muscles: ["Calves"],
    images: photos("calf-raise"),
    cues: [
      "Stand tall with your feet hip-width apart, dumbbells at your sides (or none to start).",
      "Rise up onto the balls of your feet as high as you can and pause for a second.",
      "Lower slowly until your heels touch the floor.",
    ],
    mistakes: ["Bouncing quickly through the reps.", "Rolling out onto the edges of your feet."],
    video: "dumbbell calf raise form",
  },
  {
    id: "farmer-carry",
    name: "Farmer carry",
    pattern: "core",
    kind: "timed",
    load: "pair",
    startGuess: 8,
    prescription: { sets: 2, seconds: [20, 45], rest: 60 },
    muscles: ["Grip", "Core", "Upper back"],
    images: drawing("farmer-carry"),
    cues: [
      "Squat down to pick up a dumbbell in each hand, back flat, and stand up tall.",
      "Shoulders back and down, stomach braced, eyes ahead.",
      "Walk slowly around the room with short steps for the time — or march on the spot if space is tight.",
      "Squat down to put them back on the floor.",
    ],
    mistakes: ["Leaning back or shrugging your shoulders up.", "Rushing — slow, steady steps."],
    back: "Carrying weight while standing tall trains the muscles that protect your back. Pick up and put down with a flat back, never by bending over.",
    video: "dumbbell farmer carry form",
  },
  {
    id: "suitcase-carry",
    name: "Suitcase carry",
    pattern: "core",
    kind: "timed",
    load: "single",
    perSide: true,
    startGuess: 8,
    prescription: { sets: 2, seconds: [20, 45], rest: 60 },
    muscles: ["Obliques", "Core", "Grip"],
    images: drawing("suitcase-carry"),
    cues: [
      "Pick up one dumbbell in one hand, like carrying a suitcase, and stand up tall.",
      "Don't lean towards or away from the weight — stay perfectly upright.",
      "Walk slowly for the time (or march on the spot), then switch hands.",
    ],
    mistakes: ["Leaning to one side.", "Letting the shoulder holding the weight drop."],
    back: "A favourite of back specialists: the side muscles that keep you from tipping are the ones that keep your spine steady. It works like a side plank you can load.",
    video: "suitcase carry form",
  },
  {
    id: "dumbbell-dead-bug",
    name: "Dumbbell dead bug",
    pattern: "core",
    kind: "reps",
    load: "single",
    perSide: true,
    startGuess: 2,
    prescription: { sets: 2, reps: [6, 10], rest: 45 },
    muscles: ["Deep core"],
    images: drawing("dumbbell-dead-bug"),
    cues: [
      "Lie on your back holding one dumbbell by its ends straight above your chest.",
      "Lift your knees to 90° above your hips and gently press your lower back into the floor.",
      "Slowly straighten one leg towards the floor while the dumbbell stays still, then bring it back.",
      "Switch legs. Count the reps on each side.",
    ],
    mistakes: ["Lower back lifting off the floor — make the movement smaller.", "Letting the dumbbell drift over your face."],
    back: "Like the dead bug, with the dumbbell making your stomach work harder to keep your back still. Start with the empty handle.",
    video: "dumbbell dead bug exercise",
  },

  /* ---------------------------------------------------------------- *
   * Warm-up and back care
   * ---------------------------------------------------------------- */
  {
    id: "march",
    name: "March in place",
    pattern: "mobility",
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
    pattern: "mobility",
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
    pattern: "mobility",
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
    pattern: "mobility",
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
    pattern: "mobility",
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
    pattern: "mobility",
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
    pattern: "mobility",
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
    pattern: "mobility",
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
      pattern: "core",
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

/** Uses a dumbbell (now, or once bodyweight gets easy). */
export function usesDumbbell(exercise: ExerciseDef): boolean {
  return exercise.load !== "none";
}

/** Exercises that can go into a strength workout (not the warm-up stretches). */
export const STRENGTH_EXERCISES: readonly ExerciseDef[] = LIST.filter((exercise) => exercise.pattern !== "mobility");
