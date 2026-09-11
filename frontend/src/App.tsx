import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Registration from './pages/Registration';
import SelectProfile from './pages/SelectProfile';
import Dashboard from './pages/Dashboard';
import ChapterList from './pages/ChapterList';
import ChapterContent from './pages/ChapterContent';
import FlashcardScreen from './pages/FlashcardScreen';
import QuizScreen from './pages/QuizScreen';
import FormulaSheetScreen from './pages/FormulaSheetScreen';
import Profile from './pages/Profile';
import ProgressDashboard from './pages/ProgressDashboard';
import Header from './components/Header';

// Teacher Portal Pages
import TeacherLogin from './pages/teacher/TeacherLogin';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import ContentUpload from './pages/teacher/ContentUpload';
import ContentList from './pages/teacher/ContentList';
import TeacherActivity from './pages/teacher/TeacherActivity';

/** Pages where the global header should NOT appear */
const NO_HEADER_PATHS = ['/', '/register', '/teacher'];

/** Teacher portal paths (use TeacherHeader, not student Header) */
const TEACHER_PATHS = ['/teacher/'];

function AppLayout() {
  const location = useLocation();
  const isTeacherPath = location.pathname.startsWith('/teacher');
  const showHeader = !isTeacherPath && !NO_HEADER_PATHS.includes(location.pathname);

  return (
    <div className="min-h-screen bg-canvas font-jakarta">
      {showHeader && <Header />}
      <Routes>
        {/* Student Routes */}
        <Route path="/" element={<SelectProfile />} />
        <Route path="/register" element={<Registration />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/subjects/:subjectId/chapters" element={<ChapterList />} />
        <Route path="/chapters/:chapterId" element={<ChapterContent />} />
        <Route path="/chapters/:chapterId/flashcards" element={<FlashcardScreen />} />
        <Route path="/chapters/:chapterId/formulas" element={<FormulaSheetScreen />} />
        <Route path="/chapters/:chapterId/quiz" element={<QuizScreen />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/progress" element={<ProgressDashboard />} />

        {/* Teacher Portal Routes */}
        <Route path="/teacher" element={<TeacherLogin />} />
        <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
        <Route path="/teacher/content/upload" element={<ContentUpload />} />
        <Route path="/teacher/content" element={<ContentList />} />
        <Route path="/teacher/activity" element={<TeacherActivity />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}

export default App;
