import { env } from "./env.js";

export const PHYSICS_TOPICS = [
  "Units & Dimensions",
  "Mechanics",
  "Gravitation",
  "Waves & SHM",
  "Thermodynamics",
  "Electromagnetism",
  "Optics",
  "Modern Physics"
];

export const CHEMISTRY_TOPICS = [
  "Mole concept",
  "Limiting reagent",
  "Gas laws",
  "pH",
  "Thermochemistry",
  "Equilibrium numericals",
  "Hybridization",
  "Bond order",
  "VBT",
  "CFT",
  "Periodic trends",
  "Thermal stability trends",
  "Resonance",
  "Hyperconjugation",
  "Aromaticity",
  "SN1",
  "SN2",
  "E1",
  "E2",
  "Lucas",
  "Tollens",
  "Fehling",
  "Aldol",
  "Cannizzaro"
];

export const BIOLOGY_TOPICS = env.biologyTopics;

export const TOPICS_BY_SUBJECT = {
  Physics: PHYSICS_TOPICS,
  Chemistry: CHEMISTRY_TOPICS,
  Biology: BIOLOGY_TOPICS
};

export const isAllowedTopic = (subject, topic) => {
  const list = TOPICS_BY_SUBJECT[subject] || [];
  return list.includes(topic);
};