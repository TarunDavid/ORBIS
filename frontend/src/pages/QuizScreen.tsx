import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, CheckCircle2, XCircle, Trophy, RotateCw, Bot } from 'lucide-react';
import api from '../api';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const formatMath = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
};

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

interface QuestionExplanation {
  question_id: number;
  order: number;
  explanation: string;
}

interface WeakConcept {
  concept_name: string;
  explanation: string;
  related_question_ids: number[];
}

type QuizPhase = 'loading' | 'answering' | 'results' | 'error';
type AnalysisPhase = 'idle' | 'loading' | 'done' | 'error';

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
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle');
  const [explanations, setExplanations] = useState<QuestionExplanation[]>([]);
  const [weakConcepts, setWeakConcepts] = useState<WeakConcept[]>([]);

  const generateQuiz = async () => {
    setPhase('loading');
    setError('');
    setSelectedAnswers({});
    setCurrentQ(0);
    setResults([]);
    setAnalysisPhase('idle');
    setExplanations([]);
    setWeakConcepts([]);

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
      const answerMap: Record<string, string> = {};
      questions.forEach((_, idx) => {
        const selected = selectedAnswers[idx] || '';
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
      
      if (res.data.score < res.data.total) {
        analyzeQuiz(attemptId);
      } else {
        setAnalysisPhase('done');
      }
    } catch (err) {
      console.error('Quiz submit error', err);
      setError('Failed to submit quiz.');
      setPhase('error');
    }
  };

  const analyzeQuiz = async (aid: number) => {
    setAnalysisPhase('loading');
    try {
      const res = await api.post('ai/quiz/analyze/', { attempt_id: aid });
      setExplanations(res.data.explanations || []);
      setWeakConcepts(res.data.weak_concepts || []);
      setAnalysisPhase('done');
    } catch (err) {
      console.error('Analysis error', err);
      setAnalysisPhase('error');
    }
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const allAnswered = answeredCount === questions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  return (
    <div className="min-h-screen bg-canvas text-[#121316] font-jakarta pb-16">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="clay-btn bg-white text-[#121316] hover:bg-canvas px-4 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            <span>Back to Chapter</span>
          </button>
          
          {phase === 'results' && (
            <button
              onClick={generateQuiz}
              className="clay-btn bg-mint text-[#121316] hover:bg-emerald-400 px-4 py-2 text-sm flex items-center gap-2 font-bold"
            >
              <RotateCw size={16} />
              <span>New Quiz</span>
            </button>
          )}
        </div>

        {/* Title Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center clay-circle bg-mint text-[#121316] p-3 mb-3 shadow-md">
            <Sparkles size={28} />
          </div>
          <h1 className="text-3xl md:text-5xl font-syne font-extrabold text-[#121316] tracking-tight mb-2">
            Chapter Quiz
          </h1>
          {phase === 'answering' && (
            <p className="font-grotesk text-xs uppercase tracking-widest text-stone-600 font-bold">
              Answer all questions, then submit for on-device AI analysis
            </p>
          )}
        </div>

        {/* Loading State */}
        {phase === 'loading' && (
          <div className="clay-card bg-white p-12 flex flex-col items-center justify-center my-10 max-w-lg mx-auto text-center space-y-4">
            <div className="clay-spinner"></div>
            <p className="font-syne font-bold text-lg text-[#121316]">Generating Chapter Quiz...</p>
            <p className="font-grotesk text-xs uppercase tracking-wider text-stone-500">Creating custom questions from curriculum</p>
          </div>
        )}

        {/* Error State */}
        {phase === 'error' && (
          <div className="clay-card bg-white p-8 max-w-lg mx-auto border-l-[8px] border-l-coral text-center space-y-4">
            <p className="font-syne font-bold text-lg text-coral">{error}</p>
            <button
              onClick={generateQuiz}
              className="clay-btn bg-coral text-white px-6 py-2.5 text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Quiz — Answering Phase */}
        {phase === 'answering' && questions.length > 0 && (
          <>
            {/* Progress bar */}
            <div className="mb-6 space-y-2">
              <div className="flex justify-between text-xs font-grotesk font-bold text-[#121316] uppercase tracking-wider">
                <span>Question {currentQ + 1} of {questions.length}</span>
                <span>{answeredCount} / {questions.length} Answered</span>
              </div>
              <div className="h-4 bg-white border-[3px] border-[#121316] rounded-full overflow-hidden p-0.5 shadow-sm">
                <div
                  className="h-full bg-mint rounded-full border border-[#121316] transition-all duration-300"
                  style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Question Card */}
            <div className="clay-card-lg bg-white p-6 md:p-8 mb-6 relative">
              <div className="inline-block clay-chip bg-mint text-[#121316] px-3 py-1 text-xs mb-3 font-bold">
                QUESTION {currentQ + 1}
              </div>
              <h2 className="text-xl md:text-2xl font-syne font-bold text-[#121316] mb-6 leading-snug">
                {questions[currentQ].question}
              </h2>

              <div className="space-y-3">
                {questions[currentQ].options.map((option, i) => {
                  const isSelected = selectedAnswers[currentQ] === option;
                  return (
                    <button
                      key={i}
                      onClick={() => selectAnswer(currentQ, option)}
                      className={`w-full text-left p-4 rounded-xl border-[3px] border-[#121316] font-jakarta transition-all ${
                        isSelected
                          ? 'bg-cobalt text-white font-bold shadow-none translate-x-1 translate-y-1'
                          : 'bg-canvas text-[#121316] hover:bg-white clay-card-sm'
                      }`}
                    >
                      <span className="text-sm md:text-base leading-relaxed">
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={goToPrev}
                disabled={currentQ === 0}
                className="clay-btn bg-white text-[#121316] px-5 py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              {currentQ < questions.length - 1 ? (
                <button
                  onClick={goToNext}
                  className="clay-btn bg-cobalt text-white px-6 py-2.5 text-sm font-bold"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={submitQuiz}
                  disabled={!allAnswered}
                  className="clay-btn bg-mint text-[#121316] px-6 py-2.5 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit Quiz
                </button>
              )}
            </div>

            {/* Question Quick-Jump Dots */}
            <div className="flex items-center justify-center gap-3 mt-8">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  className={`w-9 h-9 border-[2px] border-[#121316] rounded-full font-grotesk font-bold text-xs flex items-center justify-center transition-all ${
                    i === currentQ
                      ? 'bg-cobalt text-white scale-110 shadow-sm'
                      : selectedAnswers[i]
                      ? 'bg-mint text-[#121316]'
                      : 'bg-white text-stone-400'
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
            {/* Score Card Banner */}
            <div className={`clay-card-lg p-8 md:p-10 mb-8 text-center relative overflow-hidden ${
              scorePercent >= 80
                ? 'bg-mint text-[#121316]'
                : scorePercent >= 50
                ? 'bg-gold text-[#121316]'
                : 'bg-coral text-white'
            }`}>
              <div className="clay-circle bg-white text-[#121316] p-3 inline-flex mx-auto mb-3 shadow-md">
                <Trophy size={40} />
              </div>
              <h2 className="text-6xl md:text-7xl font-syne font-extrabold tracking-tight mb-2">
                {score}/{totalQuestions}
              </h2>
              <p className="font-syne font-bold text-xl md:text-2xl mb-4">
                {scorePercent >= 80
                  ? 'Outstanding Mastery! 🎉'
                  : scorePercent >= 50
                  ? 'Good Effort! Keep practicing 💪'
                  : 'Review the chapter and try again 📖'}
              </p>
              
              <div className="h-4 bg-black/20 border-2 border-[#121316] rounded-full overflow-hidden max-w-xs mx-auto p-0.5">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${scorePercent}%` }}
                />
              </div>
            </div>

            {/* Detailed Results List */}
            <div className="space-y-4">
              {results.map((result, i) => (
                <div
                  key={i}
                  className={`clay-card bg-white p-6 relative overflow-hidden ${
                    result.is_correct ? 'border-l-[8px] border-l-mint' : 'border-l-[8px] border-l-coral'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {result.is_correct ? (
                      <CheckCircle2 size={24} className="text-emerald-600 flex-shrink-0 mt-1" />
                    ) : (
                      <XCircle size={24} className="text-coral flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-syne font-bold text-base md:text-lg text-[#121316] mb-3">
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
                              className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium ${
                                isCorrect
                                  ? 'bg-mint/30 border-[#121316] text-[#121316] font-bold'
                                  : isStudentAnswer && !isCorrect
                                  ? 'bg-coral/20 border-coral text-coral line-through'
                                  : 'bg-canvas border-stone-200 text-stone-600'
                              }`}
                            >
                              <span>{option}</span>
                              {isCorrect && ' ✓ (Correct Answer)'}
                              {isStudentAnswer && !isCorrect && ' ✗ (Your Selection)'}
                            </div>
                          );
                        })}
                      </div>

                      {/* AI Explanation */}
                      {!result.is_correct && analysisPhase === 'done' && (
                        <div className="mt-4 p-4 clay-card-sm bg-canvas border-l-4 border-l-lilac">
                          <div className="flex items-center text-[#121316] font-grotesk font-bold text-xs mb-2 uppercase tracking-wide">
                            <Bot size={16} className="mr-1.5 text-purple-600" />
                            <span>AI Concept Breakdown</span>
                          </div>
                          <div className="prose prose-sm prose-slate max-w-none font-jakarta text-stone-800">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {formatMath(explanations.find(e => e.order === (i + 1))?.explanation || 'No explanation available.')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Analysis Loading / Concepts Section */}
            {analysisPhase === 'loading' && (
              <div className="clay-card bg-white p-8 my-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="clay-spinner"></div>
                <p className="font-syne font-bold text-lg text-[#121316]">Orbee is analyzing your responses...</p>
                <p className="font-grotesk text-xs uppercase tracking-wider text-stone-500">Mapping conceptual understanding offline</p>
              </div>
            )}
            
            {analysisPhase === 'error' && (
              <div className="clay-card bg-white p-6 my-8 border-l-[8px] border-l-coral text-center space-y-2">
                <p className="font-syne font-bold text-coral">Failed to analyze weak concepts.</p>
                <button 
                  onClick={() => attemptId && analyzeQuiz(attemptId)} 
                  className="clay-btn bg-coral text-white px-4 py-2 text-xs"
                >
                  Retry Analysis
                </button>
              </div>
            )}

            {analysisPhase === 'done' && scorePercent < 100 && weakConcepts.length > 0 && (
              <div className="mt-10 mb-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="clay-circle bg-lilac text-[#121316] p-2">
                    <Bot size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-syne font-extrabold text-[#121316]">Concepts to Review</h3>
                    <p className="font-grotesk text-xs uppercase tracking-wider text-stone-500">Personalized on-device study recommendations</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  {weakConcepts.map((concept, idx) => (
                    <div key={idx} className="clay-card bg-white p-6 border-l-[8px] border-l-lilac">
                      <h4 className="font-syne font-bold text-lg text-[#121316] mb-2">{concept.concept_name}</h4>
                      <div className="prose prose-sm prose-slate max-w-none text-stone-800 font-jakarta">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {formatMath(concept.explanation)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysisPhase === 'done' && scorePercent === 100 && (
              <div className="clay-card bg-mint text-[#121316] p-8 my-8 text-center">
                <p className="font-syne font-extrabold text-2xl mb-1">Perfect Score! 🌟</p>
                <p className="font-jakarta font-medium text-stone-800">You've completely mastered all concepts in this chapter!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default QuizScreen;
