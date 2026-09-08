import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { ArrowLeft } from 'lucide-react';

const Registration = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    school_name: '',
    grade: 'Grade 5',
    mentor_name: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post('students/', formData);
      localStorage.setItem('student_id', response.data.id);
      localStorage.setItem('student_name', response.data.name);
      localStorage.setItem('student_grade', response.data.grade);
      localStorage.setItem('currentStudent', JSON.stringify(response.data));
      navigate('/dashboard');
    } catch (error) {
      console.error('Registration failed', error);
      alert('Failed to register. Please ensure backend is running.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-canvas p-4 relative overflow-hidden">
      {/* Decorative stickers */}
      <div className="absolute top-10 left-10 clay-chip bg-cobalt text-white px-3 py-1.5 sticker-tilt-left hidden md:block">
        ✏️ STUDENT SETUP
      </div>
      <div className="absolute bottom-10 right-10 clay-chip bg-gold text-structural px-3 py-1.5 sticker-tilt-right hidden md:block">
        🚀 READY TO LEARN
      </div>
      <div className="absolute top-10 right-10 clay-chip bg-mint text-structural px-3 py-1.5 sticker-tilt-right flex items-center gap-2">
        <span className="neon-dot"></span>
        OFFLINE
      </div>

      <div className="bg-white p-8 md:p-10 clay-card-lg w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-structural transition-colors text-sm font-grotesk font-bold mb-6">
          <ArrowLeft size={16} />
          <span>Back</span>
        </Link>
        <h1 className="font-syne text-4xl font-[900] text-center text-structural mb-1">ORBIS</h1>
        <p className="text-center text-on-surface-variant font-jakarta mb-8">Let's get started on your learning journey!</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-text text-xs text-on-surface-variant block mb-1.5">Full Name</label>
            <input required type="text" name="name" value={formData.name} onChange={handleChange}
              className="w-full px-4 py-3 clay-input" placeholder="John Doe" />
          </div>
          <div>
            <label className="label-text text-xs text-on-surface-variant block mb-1.5">Age</label>
            <input required type="number" name="age" value={formData.age} onChange={handleChange} min="4" max="20"
              className="w-full px-4 py-3 clay-input" placeholder="10" />
          </div>
          <div>
            <label className="label-text text-xs text-on-surface-variant block mb-1.5">School Name</label>
            <input required type="text" name="school_name" value={formData.school_name} onChange={handleChange}
              className="w-full px-4 py-3 clay-input" placeholder="Springfield Elementary" />
          </div>
          <div>
            <label className="label-text text-xs text-on-surface-variant block mb-1.5">Grade</label>
            <select required name="grade" value={formData.grade} onChange={handleChange}
              className="w-full px-4 py-3 clay-select">
              <option value="Grade 1">Grade 1</option>
              <option value="Grade 2">Grade 2</option>
              <option value="Grade 3">Grade 3</option>
              <option value="Grade 4">Grade 4</option>
              <option value="Grade 5">Grade 5</option>
              <option value="Grade 6">Grade 6</option>
              <option value="Grade 7">Grade 7</option>
              <option value="Grade 8">Grade 8</option>
              <option value="Grade 9">Grade 9</option>
              <option value="Grade 10">Grade 10</option>
            </select>
          </div>
          <div>
            <label className="label-text text-xs text-on-surface-variant block mb-1.5">Mentor Name</label>
            <input required type="text" name="mentor_name" value={formData.mentor_name} onChange={handleChange}
              className="w-full px-4 py-3 clay-input" placeholder="Mr. Smith" />
          </div>
          <button type="submit" className="w-full clay-btn bg-cobalt text-white py-3.5 text-base tracking-wide">
            Start Exploring →
          </button>
        </form>
      </div>
    </div>
  );
};

export default Registration;
