import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { User, PlusCircle } from 'lucide-react';

interface StudentProfile {
  id: number;
  name: string;
  grade: string;
}

const SelectProfile = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await api.get('students/');
        setProfiles(res.data);
      } catch (error) {
        console.error('Error fetching profiles', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  const handleSelect = (profile: StudentProfile) => {
    localStorage.setItem('student_id', profile.id.toString());
    localStorage.setItem('student_name', profile.name);
    localStorage.setItem('student_grade', profile.grade);
    navigate('/dashboard');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <div className="bg-white/90 backdrop-blur-sm p-8 rounded-3xl shadow-2xl w-full max-w-2xl text-center">
        <h1 className="text-4xl font-extrabold text-slate-800 mb-2 tracking-tight">EduCarnival</h1>
        <p className="text-slate-500 mb-10 text-lg">Who is learning today?</p>
        
        {loading ? (
           <div className="flex justify-center py-10">
             <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
           </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            {profiles.map(profile => (
              <button 
                key={profile.id}
                onClick={() => handleSelect(profile)}
                className="flex flex-col items-center p-6 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all transform hover:-translate-y-2 group w-36"
              >
                <div className="w-16 h-16 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors mb-3">
                  <User size={32} />
                </div>
                <h3 className="font-bold text-slate-800 text-lg truncate w-full">{profile.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{profile.grade}</p>
              </button>
            ))}

            <Link 
              to="/register"
              className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-dashed border-slate-300 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group w-36"
            >
              <div className="w-16 h-16 text-slate-400 rounded-full flex items-center justify-center group-hover:text-indigo-500 transition-colors mb-3">
                <PlusCircle size={40} />
              </div>
              <h3 className="font-bold text-slate-600 group-hover:text-indigo-600">New Student</h3>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectProfile;
