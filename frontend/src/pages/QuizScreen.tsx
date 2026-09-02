import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, XCircle, Trophy, RotateCw } from 'lucide-react';
import api from '../api';

interface QuizQuestionData {
  question: string;
  options: string[];
  correct_answer: string;
}

interface QuizResult {
  question: string;
  options: string[];
  correct_answer: string;
  student_answer: string;
  is_correct: boolean;
}

type QuizPhase = 'loading' | 'answering' | 'results' | 'error';

const QuizScreen = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<QuizPhase>('loading');
  const [questions, setQuestions] = useState<QuizQuestionData[]>([]);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<QuizResult[]>([]);
  const [score, setScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [error, setError] = useState('');

  const generateQuiz = async () => {
    setPhase('loading');
    setError('');
    setSelectedAnswers({});
    setCurrentQ(0);
    setResults([]);

    try {
      const studentId = localStorage.getItem('student_id');
      const res = await api.post('ai/quiz/', {
        chapter_id: chapterId,
        student_id: studentId,
        count: 5,
      });
      setQuestions(res.data.questions);
      setAttemptId(res.data.attempt_id);
      setPhase('answering');
    } catch (err) {
      console.error('Quiz generation error', err);
      setError('Failed to generate quiz. Make sure the AI backend is running.');
      setPhase('error');
    }
  };

  useEffect(() => {
    generateQuiz();
  }, [chapterId]);

  const selectAnswer = (questionIndex: number, answer: string) => {
    setSelectedAnswers({ ...selectedAnswers, [questionIndex]: answer });
  };

  const goToNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    }
  };

  const goToPrev = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
    }
  };

  const submitQuiz = async () => {
    if (!attemptId) return;
    setPhase('loading');

    try {
      // Map answers by question order (1-indexed) for the backend
      const answerMap: Record<string, string> = {};
      questions.forEach((_, idx) => {
        const selected = selectedAnswers[idx] || '';
        // Extract just the letter from the selected option (e.g., "A) ..." → "A")
        const letter = selected.charAt(0);
        answerMap[String(idx + 1)] = letter;
      });

      const res = await api.post('ai/quiz/submit/', {
        attempt_id: attemptId,
        answers: answerMap,
      });

      setResults(res.data.results);
      setScore(res.data.score);
      setTotalQuestions(res.data.total);
      setPhase('results');
    } catch (err) {
      console.error('Quiz submit error', err);
      setError('Failed to submit quiz.');
      setPhase('error');
    }
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const allAnswered = answeredCount === questions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-slate-500 hover:text-slate-800 transition font-medium"
          >
            <ArrowLeft className="mr-2" size={20} /> Back to Chapter
          </button>
          {phase === 'results' && (
            <button
              onClick={generateQuiz}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-semibold rounded-xl transition"
            >
              <RotateCw size={16} /> New Quiz
            </button>
          )}
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2">
            <Sparkles className="inline mr-2 text-emerald-500" size={28} />
            Chapter Quiz
          </h1>
          {phase === 'answering' && (
            <p className="text-slate-500">
              Answer all questions, then submit to see your score
            </p>
          )}
        </div>

        {/* Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={48} className="animate-spin text-emerald-500 mb-4" />
            <p className="text-slate-600 font-medium">Generating quiz from chapter content...</p>
            <p className="text-slate-400 text-sm mt-1">This may take a moment</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <button
              onClick={generateQuiz}
              className="mt-4 px-6 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-xl transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Quiz — Answering Phase */}
        {phase === 'answering' && questions.length > 0 && (
          <>
            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-slate-500 mb-2">
                <span>Question {currentQ + 1} of {questions.length}</span>
                <span>{answeredCount} answered</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Question Card */}
            <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 mb-6">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                Question {currentQ + 1}
              </span>
              <h2 className="text-xl font-bold text-slate-800 mt-3 mb-6">
                {questions[currentQ].question}
              </h2>

              <div className="space-y-3">
                {questions[currentQ].options.map((option, i) => {
                  const isSelected = selectedAnswers[currentQ] === option;
                  return (
                    <button
                      key={i}
                      onClick={() => selectAnswer(currentQ, option)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                          : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'
                      }`}
                    >
                      <span className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={goToPrev}
                disabled={currentQ === 0}
                className="px-5 py-2.5 bg-white rounded-xl shadow-sm hover:shadow-md transition font-medium text-slate-600 disabled:opacity-30"
              >
                Previous
              </button>

              {currentQ < questions.length - 1 ? (
                <button
                  onClick={goToNext}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-sm hover:shadow-md transition font-semibold"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={submitQuiz}
                  disabled={!allAnswered}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm hover:shadow-lg transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Quiz
                </button>
              )}
            </div>

            {/* Question dots for quick navigation */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                    i === currentQ
                      ? 'bg-emerald-500 text-white scale-110'
                      : selectedAnswers[i]
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Results Phase */}
        {phase === 'results' && (
          <>
            {/* Score Card */}
            <div className={`rounded-3xl shadow-xl p-8 mb-8 text-center ${
              scorePercent >= 80
                ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                : scorePercent >= 50
                ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                : 'bg-gradient-to-br from-rose-500 to-pink-500'
            }`}>
              <Trophy size={48} className="text-white/80 mx-auto mb-3" />
              <h2 className="text-5xl font-extrabold text-white mb-2">
                {score}/{totalQuestions}
              </h2>
              <p className="text-white/80 text-lg font-medium">
                {scorePercent >= 80
                  ? 'Excellent work! 🎉'
                  : scorePercent >= 50
                  ? 'Good effort! Keep practicing 💪'
                  : 'Keep going! Review the chapter and try again 📖'}
              </p>
              <div className="mt-4 h-3 bg-white/20 rounded-full overflow-hidden max-w-xs mx-auto">
                <div
                  className="h-full bg-white/60 rounded-full transition-all duration-700"
                  style={{ width: `${scorePercent}%` }}
                />
              </div>
            </div>

            {/* Detailed Results */}
            <div className="space-y-4">
              {results.map((result, i) => (
                <div
                  key={i}
                  className={`bg-white rounded-2xl shadow-sm border-2 p-6 ${
                    result.is_correct ? 'border-emerald-200' : 'border-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {result.is_correct ? (
                      <CheckCircle2 size={24} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={24} className="text-rose-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800 mb-3">
                        Q{i + 1}. {result.question}
                      </h3>
                      <div className="space-y-2">
                        {result.options.map((option, j) => {
                          const optionLetter = option.charAt(0);
                          const isCorrect = optionLetter === result.correct_answer;
                          const isStudentAnswer = optionLetter === result.student_answer;
                          return (
                            <div
                              key={j}
                              className={`px-4 py-2 rounded-lg text-sm ${
                                isCorrect
                                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                                  : isStudentAnswer && !isCorrect
                                  ? 'bg-rose-50 text-rose-700 line-through'
                                  : 'bg-slate-50 text-slate-600'
                              }`}
                            >
                              {option}
                              {isCorrect && ' ✓'}
                              {isStudentAnswer && !isCorrect && ' ✗ (your answer)'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QuizScreen;
