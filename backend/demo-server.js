import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ['http://localhost:3000', 'http://192.168.1.6:3000'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'neet-backend-demo' });
});

// Mock auth
app.post('/api/v1/auth/login', (req, res) => {
  res.json({
    token: 'demo-token',
    user: { id: 1, email: req.body.email || 'demo@example.com', role: 'user' }
  });
});

app.post('/api/v1/auth/register', (req, res) => {
  res.json({
    token: 'demo-token',
    user: { id: 1, email: req.body.email || 'demo@example.com', role: 'user' }
  });
});

// Mock papers
app.get('/api/v1/papers/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json(generateMockPaper(today));
});

app.get('/api/v1/papers/:date', (req, res) => {
  res.json(generateMockPaper(req.params.date));
});


// Mock leaderboard - new endpoints
app.get('/api/v1/leaderboard/daily', (req, res) => {
  res.json([
    { rank: 1, name: 'Student A', score: 95, time: 120 },
    { rank: 2, name: 'Student B', score: 88, time: 135 },
    { rank: 3, name: 'Student C', score: 82, time: 140 }
  ]);
});

app.get('/api/v1/leaderboard/weekly', (req, res) => {
  res.json([
    { rank: 1, name: 'Student D', score: 680, time: 720 },
    { rank: 2, name: 'Student E', score: 650, time: 750 }
  ]);
});

// Keep old endpoint for compatibility
app.get('/api/v1/leaderboard', (req, res) => {
  res.json({
    daily: [
      { rank: 1, name: 'Student A', score: 95, time: 120 },
      { rank: 2, name: 'Student B', score: 88, time: 135 },
      { rank: 3, name: 'Student C', score: 82, time: 140 }
    ],
    weekly: [
      { rank: 1, name: 'Student D', score: 680, time: 720 },
      { rank: 2, name: 'Student E', score: 650, time: 750 }
    ]
  });
});

// Mock submit attempt - new endpoint with full response
app.post('/api/v1/attempts/submit', (req, res) => {
  const answers = req.body.answers || [];
  const correctCount = answers.filter(a => a.selectedOption === 'B').length;
  const incorrectCount = answers.filter(a => a.selectedOption && a.selectedOption !== 'B').length;
  const unattemptedCount = answers.filter(a => !a.selectedOption).length;
  
  res.json({
    attemptId: 1,
    score: correctCount * 4 - incorrectCount,
    accuracy: Math.round((correctCount / answers.length) * 100) || 0,
    correct: correctCount,
    incorrect: incorrectCount,
    unattempted: unattemptedCount,
    subjectStats: {
      Physics: { correct: 1, incorrect: 0, unattempted: 0, score: 4 },
      Chemistry: { correct: 1, incorrect: 0, unattempted: 0, score: 4 },
      Biology: { correct: 1, incorrect: 0, unattempted: 0, score: 4 }
    },
    topicStats: {
      Mechanics: { correct: 1, incorrect: 0, unattempted: 0, score: 4 },
      'Organic Chemistry': { correct: 1, incorrect: 0, unattempted: 0, score: 4 },
      'Cell Biology': { correct: 1, incorrect: 0, unattempted: 0, score: 4 }
    },
    weakAreas: [],
    strongAreas: [
      { topic: 'Mechanics', correct: 1, incorrect: 0, unattempted: 0, score: 4 },
      { topic: 'Organic Chemistry', correct: 1, incorrect: 0, unattempted: 0, score: 4 },
      { topic: 'Cell Biology', correct: 1, incorrect: 0, unattempted: 0, score: 4 }
    ],
    averageTimePerQuestion: 60,
    difficultyStats: {
      easy: { correct: 2, incorrect: 0, attempted: 2 },
      moderate: { correct: 1, incorrect: 0, attempted: 1 },
      hard: { correct: 0, incorrect: 0, attempted: 0 }
    },
    readiness: {
      score: 85,
      band: 'Competitive'
    },
    predictedRank: {
      percentile: 85,
      airRange: '15,000 - 25,000',
      note: 'ESTIMATED'
    },
    questionReview: answers.map((a, i) => ({
      questionId: a.questionId,
      selectedOption: a.selectedOption,
      correctOption: 'B',
      explanation: 'Explanation for question ' + a.questionId,
      isCorrect: a.selectedOption === 'B'
    }))
  });
});

// Keep old endpoint for compatibility
app.post('/api/v1/attempts', (req, res) => {
  res.json({
    id: 1,
    score: 85,
    correct: 17,
    incorrect: 3,
    skipped: 0,
    timeTaken: 150,
    totalQuestions: 20
  });
});


function generateMockPaper(date) {
  return {
    date: date,
    paperId: 1,
    settings: {
      exam_mode: true,
      negative_marking_enabled: true,
      exam_duration_minutes: 180,
      prediction_mode_enabled: false,
      inactivity_limit_minutes: 15
    },
    questions: [
      {
        id: 1,
        subject: 'Physics',
        topic: 'Mechanics',
        syllabusUnit: 'Unit I: Physical World and Measurement',
        questionText: 'A body of mass 2 kg is moving with velocity 5 m/s. What is its kinetic energy?',
        options: {
          A: '10 J',
          B: '25 J',
          C: '50 J',
          D: '100 J'
        },
        difficulty: 'moderate',
        conceptTag: 'Kinetic Energy',
        questionFormat: 'Single Correct',
        sourceType: 'Numerical',
        confidenceScore: 0.95,
        verificationFlag: 'Verified',
        probabilityScore: 0.85,
        correctOption: 'B',
        explanation: 'KE = ½mv² = ½ × 2 × 25 = 25 J'
      },
      {
        id: 2,
        subject: 'Chemistry',
        topic: 'Organic Chemistry',
        syllabusUnit: 'Unit XII: Organic Chemistry - Some Basic Principles',
        questionText: 'Which of the following is an alkane?',
        options: {
          A: 'C2H4',
          B: 'C2H6',
          C: 'C2H2',
          D: 'C6H6'
        },
        difficulty: 'easy',
        conceptTag: 'Alkanes',
        questionFormat: 'Single Correct',
        sourceType: 'Conceptual',
        confidenceScore: 0.98,
        verificationFlag: 'Verified',
        probabilityScore: 0.90,
        correctOption: 'B',
        explanation: 'C2H6 (ethane) follows CnH2n+2 formula for alkanes'
      },
      {
        id: 3,
        subject: 'Biology',
        topic: 'Cell Biology',
        syllabusUnit: 'Unit II: Structural Organisation in Animals and Plants',
        questionText: 'Which organelle is known as the powerhouse of the cell?',
        options: {
          A: 'Nucleus',
          B: 'Mitochondria',
          C: 'Ribosome',
          D: 'Golgi apparatus'
        },
        difficulty: 'easy',
        conceptTag: 'Cell Organelles',
        questionFormat: 'Single Correct',
        sourceType: 'Conceptual',
        confidenceScore: 0.99,
        verificationFlag: 'Verified',
        probabilityScore: 0.95,
        correctOption: 'B',
        explanation: 'Mitochondria produce ATP through cellular respiration'
      }
    ]
  };
}


app.listen(PORT, () => {
  console.log(`Demo backend running on http://localhost:${PORT}`);
  console.log('Health check: http://localhost:' + PORT + '/health');
});
