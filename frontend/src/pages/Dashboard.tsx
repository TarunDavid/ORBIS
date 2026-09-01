import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { BookOpen } from 'lucide-react';

interface Subject {
  id: number;
  identifier: string;
  display_name: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const studentName = localStorage.getItem('student_name') || 'Student';
  const studentGrade = localStorage.getItem('student_grade') || 'Grade 5';
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        // In a real scenario, we might filter subjects by grade ID, 
        // for now we fetch grades to find the right one, then its subjects.
        const res = await api.get('grades/');
        const grades = res.data;
        const currentGrade = grades.find((g: any) => g.identifier === studentGrade);
        if (currentGrade) {
          setSubjects(currentGrade.subjects);
        }
      } catch (error) {
        console.error('Error fetching subjects', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSubjects();
  }, [studentGrade]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Hello, {studentName} 👋</h1>
            <p className="text-slate-500 mt-2 text-lg">Ready to learn something new in {studentGrade}?</p>
          </div>
          <button onClick={handleLogout} className="text-sm font-medium text-slate-500 hover:text-slate-800 transition">
            Switch User
          </button>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold text-slate-700 mb-6">Your Subjects</h2>
            {subjects.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-200">
                <p className="text-slate-500">No subjects found for this grade yet. Please add data in the backend.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {subjects.map((subject) => (
                  <button 
                    key={subject.id}
                    onClick={() => navigate(`/subjects/${subject.id}/chapters`)}
                    className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1 border border-slate-100 flex flex-col items-center justify-center gap-4 text-center group"
                  >
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <BookOpen size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">{subject.display_name}</h3>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
