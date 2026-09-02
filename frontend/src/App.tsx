import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Registration from './pages/Registration';
import SelectProfile from './pages/SelectProfile';
import Dashboard from './pages/Dashboard';
import ChapterList from './pages/ChapterList';
import ChapterContent from './pages/ChapterContent';
import FlashcardScreen from './pages/FlashcardScreen';
import QuizScreen from './pages/QuizScreen';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 font-sans">
        <Routes>
          <Route path="/" element={<SelectProfile />} />
          <Route path="/register" element={<Registration />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/subjects/:subjectId/chapters" element={<ChapterList />} />
          <Route path="/chapters/:chapterId" element={<ChapterContent />} />
          <Route path="/chapters/:chapterId/flashcards" element={<FlashcardScreen />} />
          <Route path="/chapters/:chapterId/quiz" element={<QuizScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
