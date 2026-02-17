import { z } from "zod";

export const validate = (schema, target = "body") => (req, res, next) => {
  const parsed = schema.safeParse(req[target]);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten()
    });
  }
  req[target] = parsed.data;
  return next();
};

export const schemas = {
  register: z.object({
    email: z.string().email(),
    password: z.string().min(8)
  }),
  login: z.object({
    email: z.string().email(),
    password: z.string().min(8)
  }),
  attemptSubmit: z.object({
    paperDate: z.string().date(),
    answers: z.array(
      z.object({
        questionId: z.number().int().positive(),
        selectedOption: z.enum(["A", "B", "C", "D"]).nullable()
      })
    ),
    timeTakenSeconds: z.number().int().nonnegative(),
    timeBySubjectSeconds: z.record(z.number().int().nonnegative()).optional()
  }),
  regenerate: z.object({
    date: z.string().date().optional(),
    adaptiveProfile: z
      .object({
        overallAccuracy: z.number().min(0).max(100).optional(),
        averageResponseTimeSeconds: z.number().nonnegative().optional(),
        eliteMode: z.boolean().optional(),
        predictionMode: z.boolean().optional(),
        weakAreaBoost: z
          .object({
            enabled: z.boolean(),
            subject: z.enum(["Physics", "Chemistry", "Biology"]).optional(),
            topic: z.string().optional()
          })
          .optional(),
        topicStats: z.record(
          z.object({
            accuracy: z.number().min(0).max(100).optional(),
            errorTrend: z.number().optional()
          })
        ).optional()
      })
      .optional()
  }),
  updateSettings: z.object({
    examMode: z.boolean().optional(),
    negativeMarkingEnabled: z.boolean().optional(),
    examDurationMinutes: z.number().int().min(30).max(360).optional(),
    predictionModeEnabled: z.boolean().optional(),
    inactivityLimitMinutes: z.number().int().min(5).max(60).optional()
  }),
  updateTopicWeights: z.object({
    subject: z.enum(["Physics", "Chemistry", "Biology"]),
    weights: z.record(z.number().positive())
  })
};
