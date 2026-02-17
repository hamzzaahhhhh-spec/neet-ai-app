import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const client = axios.create({
  baseURL: env.aiServiceUrl,
  timeout: 60000,
  headers: {
    "x-api-key": env.aiServiceApiKey
  }
});

export const generateQuestionFromAi = async ({ subject, topics, topicWeights, difficulty, questionFormat, syllabusUnits, excludeHashes }) => {
  const response = await client.post("/generate-question", {
    subject,
    topics,
    topicWeights,
    difficulty,
    questionFormat,
    syllabusUnits,
    excludeHashes
  });
  return response.data;
};

export const warmupAi = async () => {
  try {
    await client.get("/health");
  } catch (error) {
    logger.warn({ err: error }, "AI service health check failed");
  }
};
